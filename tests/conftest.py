from __future__ import annotations

import time
from contextlib import ExitStack
from itertools import count
from pathlib import Path
from unittest.mock import patch

import pytest

_AUTH_BYPASS_PATH_FRAGMENTS = (
    "tests/capability/",
    "tests/integration/test_behavior_contract.py",
    "tests/integration/test_checkpoint_iteration.py",
    "tests/integration/test_checkpoint_user_flow.py",
    "tests/integration/test_cli.py",
    "tests/integration/test_compression_e2e.py",
    "tests/integration/test_config_e2e.py",
    "tests/integration/test_hooks_user_flow.py",
    "tests/integration/test_mcp_discovery_e2e.py",
    "tests/integration/test_python_sdk.py",
    "tests/integration/test_tui_navigation_e2e.py",
    "tests/unit/test_config_loader.py",
    "tests/unit/test_mcp_servers_screen.py",
    "tests/unit/test_provider_settings_screen.py",
    "tests/unit/test_session_picker_screen.py",
    "tests/unit/test_tool_result_settings_screen.py",
    "tests/unit/test_tui_app.py",
    "tests/unit/test_tui_navigation.py",
    "tests/unit/test_tui_run_timer_pilot.py",
    "tests/unit/test_tui_stash.py",
    "tests/unit/test_tui_thinking.py",
    "tests/unit/test_tui_workflows.py",
)

_POST_RUN_IMPROVEMENT_BYPASS_PATH_FRAGMENTS = (
    "tests/capability/",
    "tests/integration/test_behavior_contract.py",
    "tests/integration/test_checkpoint_iteration.py",
    "tests/integration/test_checkpoint_user_flow.py",
    "tests/integration/test_cli.py",
    "tests/integration/test_compression_e2e.py",
    "tests/integration/test_hooks_user_flow.py",
    "tests/integration/test_python_sdk.py",
    "tests/unit/test_tui_app.py",
    "tests/unit/test_tui_workflows.py",
)

_INTENT_CLASSIFIER_BYPASS_PATH_FRAGMENTS = (
    "tests/integration/test_behavior_contract.py",
    "tests/integration/test_checkpoint_iteration.py",
    "tests/integration/test_checkpoint_user_flow.py",
    "tests/integration/test_cli.py",
    "tests/integration/test_cli_first_run_login.py",
    "tests/integration/test_hooks_user_flow.py",
    "tests/integration/test_python_sdk.py",
    "tests/unit/test_provider_settings_screen.py",
    "tests/unit/test_session_picker_screen.py",
    "tests/unit/test_tool_result_settings_screen.py",
    "tests/unit/test_tui_app.py",
    "tests/unit/test_tui_navigation.py",
    "tests/unit/test_tui_workflows.py",
)


def _regenerate_traceables() -> None:
    """Regenerate the ReqToCode traceables before every run (blueprint §8).

    A requirement edit becomes a failing verification meta-test in the same
    run; parse errors are left for tests/unit/reqtocode to surface.
    """
    import sys

    repo_root = Path(__file__).resolve().parents[1]
    try:
        from rotaris_core.reqtocode.generator import regenerate_if_stale

        changed, errors = regenerate_if_stale(repo_root)
        if changed:
            print("[reqtocode] regenerated src/rotaris_core/reqtocode/swr.py", file=sys.stderr)
        for error in errors:
            print(f"[reqtocode] PARSE ERROR: {error}", file=sys.stderr)
    except Exception as exc:  # never block collection; meta-tests report details
        print(f"[reqtocode] regeneration skipped: {exc!r}", file=sys.stderr)


def pytest_configure(config: pytest.Config) -> None:
    """Keep pytest-textual-snapshot compatible with pytest path variants."""
    del config
    _regenerate_traceables()
    try:
        import pytest_textual_snapshot
    except Exception:
        return

    original = pytest_textual_snapshot.node_to_report_path

    def _node_to_report_path(node):
        path, _, name = node.reportinfo()
        if not hasattr(path, "parent"):
            original_reportinfo = node.reportinfo

            def _reportinfo_with_path():
                fixed_path, lineno, domain = original_reportinfo()
                return Path(fixed_path), lineno, domain

            node.reportinfo = _reportinfo_with_path
            try:
                return original(node)
            finally:
                node.reportinfo = original_reportinfo
        return original(node)

    pytest_textual_snapshot.node_to_report_path = _node_to_report_path


def _needs_auth_bypass(nodeid: str) -> bool:
    if "test_auth_" in nodeid:
        return False
    return any(fragment in nodeid for fragment in _AUTH_BYPASS_PATH_FRAGMENTS)


def _needs_intent_classifier_bypass(nodeid: str) -> bool:
    if "tests/unit/test_intent_classifier.py" in nodeid:
        return False
    return any(fragment in nodeid for fragment in _INTENT_CLASSIFIER_BYPASS_PATH_FRAGMENTS)


@pytest.fixture(autouse=True, scope="session")
def _allow_short_context_windows() -> None:
    import os

    original = os.environ.get("ALLOW_SHORT_CONTEXT_WINDOWS")
    os.environ["ALLOW_SHORT_CONTEXT_WINDOWS"] = "true"
    try:
        yield
    finally:
        if original is None:
            os.environ.pop("ALLOW_SHORT_CONTEXT_WINDOWS", None)
        else:
            os.environ["ALLOW_SHORT_CONTEXT_WINDOWS"] = original


#: Stand-in for the Rotaris Cloud auth host inside tests. ``.invalid`` is
#: reserved by RFC 6761 and never resolves, so a request that escapes its mock
#: Files that drive the CLI far enough to validate a whole config, so they need
#: a provider to exist. Deliberately narrower than the auth bypass below: the
#: seeded models land in the model pickers, and the TUI tests choose from those
#: lists by position, so handing them extra models changes what they select.
_PROVIDER_SNAPSHOT_PATH_FRAGMENTS = (
    "tests/integration/test_behavior_contract.py",
    "tests/integration/test_cli.py",
)

#: A provider snapshot standing in for `rotaris-cli login`. Model ids match the
#: shipped defaults so the config the CLI loads needs no further doctoring.
_SNAPSHOT_DISCOVERED_AT = "2026-01-01T00:00:00+00:00"


def _needs_provider_snapshot(nodeid: str) -> bool:
    return any(fragment in nodeid for fragment in _PROVIDER_SNAPSHOT_PATH_FRAGMENTS)


def _seed_provider_snapshot(global_dir) -> None:
    from rotaris_core.config.project_snapshot import (
        ProjectSnapshot,
        SnapshotModel,
        SnapshotProvider,
        write_snapshot,
    )

    write_snapshot(
        ProjectSnapshot(
            providers={
                "openai": SnapshotProvider(
                    id="openai",
                    display_name="OpenAI",
                    family="openai",
                    authenticated=True,
                    models=[
                        SnapshotModel(id=model_id, discovered_at=_SNAPSHOT_DISCOVERED_AT)
                        for model_id in ("gpt-5-mini", "gpt-5")
                    ],
                    small_model="gpt-5-mini",
                    medium_model="gpt-5-mini",
                    large_model="gpt-5",
                    default_summary_model="gpt-5-mini",
                    discovered_at=_SNAPSHOT_DISCOVERED_AT,
                ),
            },
        ),
        base=global_dir,
    )


@pytest.fixture(autouse=True)
def _isolate_global_config_dir(request, tmp_path_factory, monkeypatch):
    """Keep the user's `~/.config/rotaris/` out of the suite, in both directions.

    The loader builds `models:` from the project snapshot written there by
    `rotaris-cli login`, so which models a test sees is a fact about whether the
    developer has logged in. Tests that drive the CLI end to end passed on a
    machine with a provider and failed on a fresh checkout with
    "Default summary model 'gpt-5-mini' does not exist" -- and they *wrote* to
    that directory too, so the first run on a new machine seeded the state the
    later ones depended on.

    Scoped to the files that drive a whole CLI invocation rather than applied
    everywhere: the seeded models land in the model pickers, and the TUI tests
    pick from those lists by position. Each of these tests gets its own empty
    global config dir plus a snapshot standing in for a logged-in provider --
    running the CLI without one is a genuine error, not a state worth asserting
    here.
    """
    if not _needs_provider_snapshot(request.node.nodeid):
        yield
        return

    from rotaris_core.config import loader

    global_dir = tmp_path_factory.mktemp("global-config")
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    _seed_provider_snapshot(global_dir)
    yield


#: Where the per-test isolated homes live, and the counter that names them.
#: One directory under the session's base temp dir instead of several thousand.
_ISOLATED_HOMES: Path | None = None
_ISOLATED_HOME_COUNTER = count()


def _next_isolated_home(tmp_path_factory) -> Path:
    """A fresh empty directory for this test to call ``Path.home()``.

    Not ``tmp_path_factory.mktemp``: that picks its number by listing the base temp
    directory, so it costs one ``iterdir`` over everything the session has created so
    far. Called from an autouse fixture it is therefore quadratic in the number of
    tests -- measured at 0.19ms with an empty base and 6ms once ~10k entries had
    accumulated, which is where a serial full pass ends up. Numbering our own
    directories under one parent keeps the isolation and makes the cost constant.

    ``tmp_path`` is deliberately not reused for this: tests assert on what their own
    ``tmp_path`` contains, and a home is not theirs.
    """
    global _ISOLATED_HOMES
    if _ISOLATED_HOMES is None:
        _ISOLATED_HOMES = tmp_path_factory.mktemp("isolated-homes")
    home = _ISOLATED_HOMES / str(next(_ISOLATED_HOME_COUNTER))
    home.mkdir()
    return home


@pytest.fixture(autouse=True)
def _isolate_user_skill_roots(tmp_path_factory, monkeypatch):
    """Hide the developer's installed skills from every test.

    Skill discovery reads four user-scope roots -- ``~/.agents/skills``,
    ``~/.config/opencode/skills``, ``~/.openhands/skills/installed`` and
    ``/etc/codex/skills``. None of them are workspace state, so whether a test
    sees them depends on the machine it runs on: the same assertion about which
    skills reach an agent passes on a laptop with skills installed and fails in
    a fresh container, or the reverse once a force-loaded skill appears under
    one of those roots and shows up as an extra agent-context entry.

    Pointing ``Path.home()`` at an empty directory covers the first three. The
    Codex root is absolute, so it is redirected separately. Tests that *want*
    user-scope skills (``test_skill_catalog.py``) re-point ``Path.home()`` at a
    home they populate themselves, which still works on top of this.
    """
    from rotaris_core.skills import catalog as skill_catalog
    from rotaris_core.skills import clear_skill_catalog_cache

    home = _next_isolated_home(tmp_path_factory)
    monkeypatch.setattr(Path, "home", lambda: home)
    monkeypatch.setattr(skill_catalog, "SYSTEM_SKILL_ROOT", home / "absent-codex-skills")

    # The catalog memoises per workspace root, so a leaked entry from a previous
    # test would outlive the patch above.
    clear_skill_catalog_cache()
    yield
    clear_skill_catalog_cache()


#: What the TUI renders as its version inside a visual-regression snapshot.
#: Pinned so a release version bump is not also a snapshot rewrite: the status
#: bar and the composer border both print ``v<version>``, so without this every
#: bump silently invalidates seven baselines that have nothing to do with the
#: change being made.
SNAPSHOT_VERSION = "0.0.0"


@pytest.fixture(autouse=True)
def _pin_version_in_snapshots(request, monkeypatch):
    """Freeze ``rotaris_core.__version__`` for visual-regression tests only.

    Scoped by test name rather than by file: ``test_tui_workflows.py`` holds
    both snapshot tests and a test that asserts the composer shows the *real*
    version, and that second one must keep seeing the truth.
    """
    if not request.node.name.startswith("test_snapshot_"):
        yield
        return

    import rotaris_core

    monkeypatch.setattr(rotaris_core, "__version__", SNAPSHOT_VERSION)
    yield


@pytest.fixture(autouse=True)
def _disable_textual_cursor_blink(monkeypatch):
    """Stop Input/TextArea cursors blinking so TUI renders are time-invariant.

    Textual starts a 0.5s blink timer for every focused ``Input`` and ``TextArea``,
    so a snapshot captures whichever half of the cycle the app happened to be in.
    Any test slow enough to cross a 0.5s boundary -- routine under ``-n auto`` --
    then renders the composer without its cursor and fails against a baseline that
    has one. Pinning the reactive default leaves ``_cursor_visible`` True, i.e. the
    cursor is always drawn, which is the state every committed baseline holds.

    Neither widget takes a ``cursor_blink`` constructor argument; both read the
    class-level default at mount, so this also covers widgets mounted mid-test
    (the command palette brings its own ``Input``).
    """
    from textual.widgets import Input, TextArea

    monkeypatch.setattr(Input.cursor_blink, "_default", False)
    monkeypatch.setattr(TextArea.cursor_blink, "_default", False)


#: What the status bar prints inside a visual-regression snapshot. Pinned because
#: the real values are the machine's working directory and the checked-out branch:
#: without this, every baseline would encode one developer's drive letter and
#: whichever branch it was recorded on, and would fail everywhere else.
SNAPSHOT_WORKSPACE_DISPLAY = "~/demo"
SNAPSHOT_BRANCH = "main"


@pytest.fixture(autouse=True)
def _pin_status_bar_in_snapshots(request, monkeypatch):
    """Freeze the status bar's workspace path and git branch for snapshot tests.

    ``_refresh_branch`` is replaced wholesale rather than stubbing
    ``_detect_git_branch_sync``: the real one hops through ``asyncio.to_thread``
    to run ``git rev-parse`` with a 1s timeout, and neither ``pilot.pause()`` nor
    ``wait_for_scheduled_animations()`` waits for a worker. Whether the branch had
    landed by screenshot time would then depend on machine load -- the same class
    of baseline mismatch the cursor blink used to cause.
    """
    if not request.node.name.startswith("test_snapshot_"):
        yield
        return

    from rotaris_core.tui.widgets import status_bar
    from rotaris_core.tui.widgets.status_bar import StatusBar

    async def _pinned_refresh_branch(self: StatusBar) -> None:
        self._branch = SNAPSHOT_BRANCH
        self._update_render()

    monkeypatch.setattr(status_bar, "_collapse_home", lambda _path: SNAPSHOT_WORKSPACE_DISPLAY)
    monkeypatch.setattr(StatusBar, "_refresh_branch", _pinned_refresh_branch)
    yield


@pytest.fixture(autouse=True)
def _bypass_auth_storage(request, tmp_path_factory):
    """Prevent auth flows from triggering network requests in tests that load app config.

    Most tests never touch auth storage. Restrict the patch to the config/TUI/CLI
    slices that do, while still opting auth-specific tests out automatically.
    """
    if not _needs_auth_bypass(request.node.nodeid):
        yield
        return

    from rotaris_core.auth.provider import AuthStatus, TokenSet

    fake_tokens = TokenSet(
        access_token="test-token",
        refresh_token="ghu_test_fake_token",
        expires_at=time.time() + 3600,
        extra={"requested_scopes": "openid profile email offline_access"},
    )
    token_dir = tmp_path_factory.getbasetemp() / "auth-tokens"
    with ExitStack() as stack:
        stack.enter_context(
            patch("rotaris_core.auth.storage._get_default_token_dir", return_value=token_dir),
        )
        stack.enter_context(
            patch("rotaris_core.auth.storage.TokenStorage.load", return_value=fake_tokens),
        )
        stack.enter_context(
            patch(
                "rotaris_core.auth.manager.AuthManager.check_status",
                return_value=AuthStatus.AUTHENTICATED,
            ),
        )
        # The loop-free twin the config loader reads; patched alongside its
        # awaitable face so neither path can reach real credentials.
        stack.enter_context(
            patch(
                "rotaris_core.auth.manager.AuthManager.peek_status",
                return_value=AuthStatus.AUTHENTICATED,
            ),
        )
        stack.enter_context(
            patch("rotaris_core.auth.manager.AuthManager.get_token", return_value="test-token"),
        )
        yield


@pytest.fixture(autouse=True)
def _bypass_intent_classifier_for_startup_tests(request):
    """Keep startup tests offline; classifier behavior has dedicated unit coverage."""
    if not _needs_intent_classifier_bypass(request.node.nodeid):
        yield
        return

    from rotaris_core.ralph.intent_classifier import IntentCategory, IntentClassificationResult

    async def _fake_classify_initial_intent(*args, **kwargs):
        del args, kwargs
        return IntentClassificationResult(intent=IntentCategory.MODERATE_FEATURE)

    with patch(
        "rotaris_core.ralph.intent_classifier.classify_initial_intent",
        side_effect=_fake_classify_initial_intent,
    ):
        yield


@pytest.fixture(autouse=True)
def _skip_post_run_improvement_analysis(request):
    """Keep CLI/TUI run tests offline: the post-run collector calls a real LLM.

    The hosts still capture the job and apply its result, so the wiring stays
    covered; the analysis itself has dedicated coverage in
    tests/unit/improvement/ and tests/unit/test_ralph_post_run_collector.py.
    """
    if not any(
        fragment in request.node.nodeid for fragment in _POST_RUN_IMPROVEMENT_BYPASS_PATH_FRAGMENTS
    ):
        yield
        return

    from rotaris_core.ralph.loop import PostRunImprovementResult

    async def _skip(self):
        del self
        return PostRunImprovementResult()

    with patch("rotaris_core.ralph.loop.PostRunImprovementJob.run", new=_skip):
        yield


@pytest.fixture(autouse=True)
def _isolate_prompt_registry():
    """Stop one test's queued prompts from being consumed by the next one's run.

    ``rotaris_core.api.prompts.prompt_api`` wraps a process-wide ``PromptRegistry``
    singleton, and nothing ever emptied it between tests. A test that submits a
    prompt and does not drain it leaves it there, and the next test that starts a
    run picks it up as though a user had typed it -- so
    ``tests/test_prompt_api.py`` queuing three prompts made
    ``test_tui_app.py::test_start_run_uses_recent_session_context_for_follow_up_task``
    see four child payloads instead of one. Deterministic once those two run in
    that order, which under ``-n auto`` is a matter of which worker gets what.

    Three test files had each grown their own copy of this fixture, reaching into
    the registry's private dicts. The isolation belongs to the suite rather than
    to whoever remembered, so it lives here and uses the registry's own
    :meth:`~rotaris_core.core.prompt_types.PromptRegistry.clear`.
    """
    from rotaris_core.core.prompt_types import PromptRegistry

    PromptRegistry().clear()
    yield
    PromptRegistry().clear()


@pytest.fixture(autouse=True)
def _isolate_runtime_mcp_discovery(request):
    """Keep unrelated tests from launching configured MCP servers or making network calls."""
    if "tests/unit/test_mcp_tool_discovery.py" in request.node.nodeid:
        yield
        return

    from rotaris_core.config.mcp_tool_discovery import clear_mcp_tool_discovery_cache

    clear_mcp_tool_discovery_cache()
    with patch(
        "rotaris_core.config.mcp_tool_discovery._run_tool_discovery",
        return_value=[],
    ):
        yield
    clear_mcp_tool_discovery_cache()


@pytest.fixture
def tmp_workspace(tmp_path: Path) -> Path:
    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / ".rotaris").mkdir()
    return ws


@pytest.fixture
def fixtures_dir() -> Path:
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_small_file(fixtures_dir: Path) -> Path:
    return fixtures_dir / "files" / "small.py"


@pytest.fixture
def sample_large_file(fixtures_dir: Path) -> Path:
    return fixtures_dir / "files" / "large.py"


@pytest.fixture
def sample_unicode_file(fixtures_dir: Path) -> Path:
    return fixtures_dir / "files" / "unicode.py"


@pytest.fixture
def sample_crlf_file(fixtures_dir: Path) -> Path:
    return fixtures_dir / "files" / "crlf.py"


@pytest.fixture
def sample_empty_file(fixtures_dir: Path) -> Path:
    return fixtures_dir / "files" / "empty.py"


@pytest.fixture
def global_config_dir(fixtures_dir: Path) -> Path:
    return fixtures_dir / "configs" / "global"


@pytest.fixture
def workspace_config_dir(fixtures_dir: Path) -> Path:
    return fixtures_dir / "configs" / "workspace"
