from __future__ import annotations

import os
import sys
import threading
import tracemalloc
from itertools import count
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from collections.abc import Iterator

    from PySide6.QtWidgets import QWidget

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

APP_ROOT = Path(__file__).parents[1]
SRC = APP_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

# The repository root, so a Rotaris test can import the shared, non-collected
# harnesses that live in the root ``tests`` package (``tests.integration
# .scripted_llm``). Appended rather than inserted: nothing here should be able
# to shadow ``rotaris`` or an installed distribution.
REPO_ROOT = Path(__file__).parents[3]
if (REPO_ROOT / "tests" / "__init__.py").exists() and str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    """Count verdicts, so a run that loses some cannot exit 0.

    The Qt suite is where this matters most — it is the one that has produced a
    run with no summary line at all. Reasoning in `tests/verdict_guard.py`.
    """
    from tests.verdict_guard import record_report

    record_report(report)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    from tests.verdict_guard import missing_verdicts

    if (message := missing_verdicts(session, exitstatus)) is not None:
        session.exitstatus = 1
        print(f"\n[verdict-guard] {message}", file=sys.stderr)


#: Where the per-test settings stores live, and the counter that names them.
_SETTINGS_ROOTS: Path | None = None
_SETTINGS_COUNTER = count()


def _next_settings_root(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A fresh empty directory for one test's `QSettings` store.

    Numbered by us rather than by `tmp_path_factory.mktemp`, which picks its suffix
    by listing the session's whole base temp directory -- an O(n) scan on every call,
    from an autouse fixture, once per test.
    """
    global _SETTINGS_ROOTS
    if _SETTINGS_ROOTS is None:
        _SETTINGS_ROOTS = tmp_path_factory.mktemp("ui-settings")
    root = _SETTINGS_ROOTS / str(next(_SETTINGS_COUNTER))
    root.mkdir()
    return root


@pytest.fixture(autouse=True)
def isolated_ui_settings(tmp_path_factory: pytest.TempPathFactory) -> None:
    """Give each test its own `QSettings` store.

    `MainWindow` remembers desktop state — the composer draft, panel sizes — in
    a process-wide `QSettings`. Shared, that is a channel between tests: one test
    types a prompt and the next one opens a window with that text already in the
    composer. It also writes into the developer's real config while the suite
    runs. A per-test path closes both.

    The application identity is set here too, and is load-bearing rather than
    decoration: `QSettings()` built without an organization name never leaves
    `AccessError`, so every preference a test writes would silently vanish and
    the persistence it means to check would pass for the wrong reason. `main.py`
    sets the same pair on the real application.
    """
    from PySide6.QtCore import QCoreApplication, QSettings

    # Deliberately not the test's own `tmp_path`: tests assert on what that
    # directory contains, and settings are not theirs.
    settings_root = _next_settings_root(tmp_path_factory)
    for scope in (QSettings.Scope.UserScope, QSettings.Scope.SystemScope):
        for fmt in (QSettings.Format.NativeFormat, QSettings.Format.IniFormat):
            QSettings.setPath(fmt, scope, str(settings_root))
    QSettings.setDefaultFormat(QSettings.Format.IniFormat)
    QCoreApplication.setOrganizationName("Rotaris")
    QCoreApplication.setApplicationName("Rotaris")


@pytest.fixture(autouse=True)
def quiet_run_permission_notice(isolated_ui_settings: None) -> None:
    """Silence the release disclosure (SWR-3707) for the suite at large.

    Releasing a requirement raises a modal that states what the run is given and
    waits for an answer. That is the point of it, and it is also why a suite
    running unattended must not meet it: `exec` on an unanswered modal blocks the
    test thread until the timeout kills it, and every board test that drops a
    card on `Ready` would hang rather than fail.

    So the default here is "already told", the same answer the third button
    records. The tests that are *about* the disclosure turn it back on
    explicitly, which is what keeps this fixture from hiding the feature it
    quiets: `test_requirement_run_permissions.py` writes the preference itself
    and asserts on the dialog it then gets.
    """
    del isolated_ui_settings
    from rotaris.services.requirement_run_permissions import suppress_notice

    suppress_notice()


@pytest.fixture(autouse=True)
def isolated_prompt_registry() -> Iterator[None]:
    """Stop one test's queued prompts from reaching the next test's run.

    `RunBridge` submits steering and queued prompts into
    `rotaris_core.api.prompts.prompt_api`, which wraps a process-wide singleton
    registry with no lifetime of its own. Undrained, a prompt one test queues is
    one the next test's run consumes as if a user had typed it. The engine suite
    carries the same fixture for the same reason.
    """
    from rotaris_core.core.prompt_types import PromptRegistry

    PromptRegistry().clear()
    yield
    PromptRegistry().clear()


@pytest.fixture
def real_project_initialization() -> None:
    """Opt back in to running the workspace's real setup tasks.

    Requested by the tests that are *about* project initialization. They point
    the workspace at a `serena` of their own making, so the run stays hermetic
    while still going through the real registry, the real worker thread and a
    real subprocess.
    """
    return None


@pytest.fixture(autouse=True)
def no_unasked_project_initialization(request: pytest.FixtureRequest) -> Iterator[None]:
    """Opening a window must not run this machine's real setup in a test's repo.

    `MainWindow` asks the registry what the workspace owes one event-loop turn
    after it is built, and starts whatever needs no decision from the user
    (SWR-2821) on a worker thread. In a test that is a *real* serena install,
    launched as a subprocess against the tmp repository the test just made — so
    it writes `.serena/` into that tree, and any test that afterwards asks Git
    what changed gets an answer about Rotaris's own setup rather than about the
    code under test.

    Measured, not theorised: `test_user_restores_a_session_checkpoint_from_the_git_view`
    failed under load because the restore preview found those files uncommitted
    and correctly refused to overwrite them. It passed on an idle machine only
    because setup happened to finish before the preview was taken. The same
    worker is what left a live `QThread` running a subprocess across a test
    boundary, which aborts the process when its parent is destroyed.

    Neutralised at the registry, not at the window, so a test still exercises
    every wire the window has — the decision, the worker, the store flags, the
    finish handlers — and only the machine work is left out.
    """
    if "real_project_initialization" in request.fixturenames:
        yield
        return
    from rotaris_core.init import registry

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(registry, "run_pending_tasks", lambda *_args, **_kwargs: ())
        yield


@pytest.fixture(autouse=True)
def no_leaked_allocation_sampler() -> Iterator[None]:
    """Fail the test that leaks a diagnostics sampler, not the one that runs next.

    `LiveDiagnostics` samples allocations on a worker thread that switches
    `tracemalloc` — process-wide state — on and off. A sampler that outlives its
    test keeps doing that under whatever runs after it, which is how a test that
    never touched tracing ends up asserting on it. Held here so the leak is
    reported where it happened and cannot travel.
    """
    yield
    samplers = [
        thread
        for thread in threading.enumerate()
        if thread.name == "RotarisAllocationSnapshot" and thread.is_alive()
    ]
    for sampler in samplers:
        sampler.join(timeout=5)
    assert not [sampler for sampler in samplers if sampler.is_alive()], (
        "a diagnostics allocation sampler outlived its test"
    )
    assert not tracemalloc.is_tracing(), "this test left tracemalloc running for the next one"


def dispose_window(window: QWidget) -> None:
    """Destroy *window* now, instead of leaving it for whoever runs next.

    `qtbot.addWidget` closes a widget at the end of a test but does not destroy
    it, and a window that was `show()`n is not collected on its own either. The
    survivors pile up in `QApplication.topLevelWidgets()` — and almost everything
    this suite does is a walk over exactly that list. `ThemeManager.apply`
    repolishes every top-level widget and all of its descendants; Qt re-resolves
    style and fonts over the same set whenever the font database changes.

    The cost is quadratic in a way that does not look like one, because it is
    billed to the wrong test. Measured: `test_design_language.py` takes **6s**
    alone and **1718s** when `test_accessibility_sweep.py` — seven shown
    `MainWindow`s — precedes it in the same process, with 52s of that spent
    tearing down a test whose body asserts a single `KeyError`.

    It is also where the "flaky segfault" came from. Once one test crosses
    `--timeout=120`, pytest-timeout's Windows path is `os._exit(1)`: the worker
    dies mid-run, xdist prints `node down: Not properly terminated`, and a suite
    that is merely slow presents as a crash in whichever test the scheduler
    happened to put there.

    Deliberately a helper a fixture calls, not an autouse sweep over every
    top-level widget. That was tried: closing and deleting widgets `qtbot` also
    owns made three workers die inside `pytest-qt`'s own `_process_events` on the
    *following* test's setup. A window is disposed of by whoever created it.
    """
    from PySide6.QtCore import QEvent
    from PySide6.QtWidgets import QApplication
    from shiboken6 import isValid

    if not isValid(window):
        return
    window.close()
    window.deleteLater()
    app = QApplication.instance()
    if app is not None:
        # `processEvents` does not run deferred deletions: they are delivered
        # only when the event loop unwinds to the level that posted them, which
        # never happens in a test. Naming the event type is what frees the C++
        # object here rather than at some later, unrelated test's expense.
        app.sendPostedEvents(None, QEvent.Type.DeferredDelete.value)
