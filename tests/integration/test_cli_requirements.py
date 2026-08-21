"""Productive use: on a build machine with no display and no desktop app installed, a
person (or a CI job) types `rotaris-headless requirements run SWR-…` in their own checkout
and walks away.
Expected outcome: the shipped command composes the real flow — the guarded write path, the
real Git worktree, the real run seam and the engine's own run host — takes the requirement
from wherever it stood to a reviewable result, prints the stages as they happen and exits
on the outcome; a requirement that does not exist costs exit 2 and one sentence; and
importing the command module pulls in neither `rotaris` nor Qt."""

from __future__ import annotations

import datetime as dt
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.cli.argparse_app import main
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.records import AnalysisRecordStore
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.run_result import RunResult as AgentRunResult
from rotaris_core.run_result import RunStatus

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris_core.run_host import RunRequest
    from rotaris_core.session.manager import SessionManager

pytestmark = pytest.mark.integration

REQ = "SWR-3416"
AT = dt.datetime(2026, 8, 16, 9, 0, tzinfo=dt.UTC)


# --------------------------------------------------------------------------
# the user's own project: a real checkout with a real requirement store
# --------------------------------------------------------------------------


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def project(root: Path) -> Path:
    """A git checkout that has adopted ReqToCode, with one epic and one requirement."""
    (root / "docs" / "requirements" / "3400-requirement-execution").mkdir(parents=True)
    (root / "docs" / "requirements" / "3400-requirement-execution.md").write_text(
        "---\nreq-id: SWR-3400\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Requirement Execution"\n---\n\n# 3400 — Requirement Execution\n',
        encoding="utf-8",
    )
    (
        root / "docs" / "requirements" / "3400-requirement-execution" / f"{REQ}-headless.md"
    ).write_text(
        f"---\nreq-id: {REQ}\nstatus: approved\ntrace: required\ntest: required\n"
        'title: "Requirement runs are launchable without the desktop"\n'
        "epic: SWR-3400\n---\n\n"
        f"# {REQ} — Requirement runs are launchable without the desktop\n\n"
        "Requirement execution reaches the run machinery through an engine seam, and the\n"
        "headless CLI is one of its consumers.\n",
        encoding="utf-8",
    )
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    # This project declares no check suite, explicitly. Written rather than left
    # to detection so the test measures the command and not the machine it runs
    # on: a developer whose own global config declares checks would otherwise
    # have the run execute them inside the requirement's worktree.
    (root / ".rotaris").mkdir()
    (root / ".rotaris" / "agents.yaml").write_text(
        "verifier:\n    checks: []\n",
        encoding="utf-8",
    )
    (root / "src").mkdir()
    (root / "src" / "seam.py").write_text("def start() -> None: ...\n", encoding="utf-8")
    git(root, "init", "-b", "main")
    git(root, "config", "user.name", "Test User")
    git(root, "config", "user.email", "test@example.invalid")
    # Windows' 260-character path limit, which this test walks straight into and
    # which is not what it is about. The run checks out
    # `docs/requirements/3400-requirement-execution/SWR-3416-headless.md` inside a
    # worktree inside `tmp_path`, and under `-n auto` pytest-xdist adds a
    # `popen-gwN` segment to that path — enough to push the checkout over the
    # limit and no further. The tests then failed under the project's own standard
    # invocation while passing serially, which reads like flakiness and is not:
    # `git` said exactly what was wrong ("Filename too long") every time.
    #
    # Set on the repository rather than worked around by shortening the fixture,
    # because the deep path is the realistic one — a user's requirement tree looks
    # like this. Same reasoning as the `core.autocrlf false` in the improvement
    # tests: take the platform's interference out of what is being measured.
    git(root, "config", "core.longpaths", "true")
    git(root, "add", ".")
    git(root, "commit", "-m", "the project as it stands")
    return root


# --------------------------------------------------------------------------
# the one faked system: the agent itself
# --------------------------------------------------------------------------


def implementing_agent(
    monkeypatch: pytest.MonkeyPatch,
    *,
    filename: str = "src/unit.py",
) -> list[str]:
    """Replace the model run — and only that — with an agent that commits its work.

    Everything else in the command stays the shipped object: the flow, the
    completion gate, the seam, the Git worktree and the check suite. ``execute_run``
    is patched on its own module, which is where :class:`CliRunHost` imports it
    from at call time, so the host under test is the real one.

    The stand-in performs the two steps the real entry point takes before it
    reaches a model, and performs them by calling the real code: it registers the
    session with the attribution off the ``RunRequest`` the host built
    (SWR-3612), and it binds the worktree that request names through
    :func:`~rotaris_core.run_host._bind_worktree` — the function that turns
    ``worktree_path`` into the session's recorded tree and re-roots the config
    onto it. Reaching for a private is deliberate: reproducing what it does would
    make this test agree with a copy of the binding rather than with the binding.
    Everything after that — ``SessionState``, the ``metadata.json`` write and
    ``list_sessions`` reading it back — is the real core code.
    """
    tasks: list[str] = []

    async def execute_run(
        request: RunRequest,
        session_manager: SessionManager,
        **_kwargs: object,
    ) -> AgentRunResult:
        from rotaris_core.run_host import _bind_worktree

        tasks.append(request.task)
        state = session_manager.create_session(
            request.config,
            requirement_id=request.requirement_id,
            unit_id=request.unit_id,
        )
        runtime = _bind_worktree(request, request.config, session_manager, state)
        tree = Path(runtime.workspace_root)
        target = tree / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("def unit() -> None: ...\n", encoding="utf-8")
        git(tree, "add", filename)
        git(
            tree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            "the unit's work",
        )
        return AgentRunResult(
            session_id=state.session_id,
            status=RunStatus.COMPLETED,
            summary="implemented the unit as the snapshot describes it",
        )

    monkeypatch.setattr("rotaris_core.run_host.execute_run", execute_run)
    return tasks


def desktop_modules() -> set[str]:
    return {
        name
        for name in sys.modules
        if name == "rotaris" or name.startswith(("rotaris.", "PySide6", "PyQt", "shiboken"))
    }


@pytest.fixture
def no_desktop_import() -> Iterator[None]:
    """Fails if the test body pulls the desktop package into the interpreter."""
    before = desktop_modules()
    yield
    assert desktop_modules() - before == set()


# --------------------------------------------------------------------------
# the command itself
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3416, SWR.SWR_3413)
def test_the_headless_command_takes_a_requirement_to_a_reviewable_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    no_desktop_import: None,
) -> None:
    """The whole of SWR-3416: a run, a worktree and a terminal state, with no desktop."""
    root = project(tmp_path / "checkout")
    tasks = implementing_agent(monkeypatch)

    code = main(argv=["requirements", "run", REQ, "--workspace", str(root)])
    captured = capsys.readouterr()

    assert code == 0, captured.err
    assert f"{REQ}: Review" in captured.out
    # The requirement's own state, as the store holds it after the command.
    assert DeliveryStore(root).read(REQ).state is DeliveryState.REVIEW
    # A real worktree, cut from the checkout, holding the unit's work.
    worktrees = [line for line in git(root, "worktree", "list").splitlines() if "req" in line]
    assert worktrees, git(root, "worktree", "list")
    # The agent was given the specification, never a re-read of the file.
    assert REQ in tasks[0]
    assert "do not re-read the requirement file" in tasks[0]


@verifies(SWR.SWR_3416, SWR.SWR_3413)
def test_the_stages_are_printed_as_they_happen_and_the_outcome_is_the_last_word(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A user who walks away can read afterwards what the run did, in order."""
    root = project(tmp_path / "checkout")
    implementing_agent(monkeypatch)

    code = main(argv=["requirements", "run", REQ, "--workspace", str(root)])
    captured = capsys.readouterr()

    assert code == 0, captured.err
    # Progress on stderr, so a pipe receives the outcome line and nothing else.
    assert "snapshot: started" in captured.err
    assert "run: started" in captured.err
    assert captured.out.strip() == f"{REQ}: Review"


@verifies(SWR.SWR_3416)
def test_an_unknown_requirement_costs_exit_two_and_one_sentence(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The ``events`` group's convention: 2 for "not found", and nothing on stdout."""
    root = project(tmp_path / "checkout")

    code = main(argv=["requirements", "run", "SWR-9999", "--workspace", str(root)])
    captured = capsys.readouterr()

    assert code == 2
    assert captured.out == ""
    assert "SWR-9999 is not in this project's requirement store" in captured.err


@verifies(SWR.SWR_3416)
def test_a_workspace_with_no_requirement_store_is_answered_not_crashed(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A project that keeps its requirements elsewhere is not an error in Rotaris."""
    root = tmp_path / "plain"
    root.mkdir()

    code = main(argv=["requirements", "run", REQ, "--workspace", str(root)])
    captured = capsys.readouterr()

    assert code == 2
    assert "no ReqToCode requirement store" in captured.err


@verifies(SWR.SWR_3416, SWR.SWR_3201)
def test_list_names_every_requirement_and_the_state_delivery_holds_it_in(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The listing a user reads before choosing what to run, and after the run."""
    root = project(tmp_path / "checkout")

    assert main(argv=["requirements", "list", "--workspace", str(root)]) == 0
    before = capsys.readouterr().out
    assert f"{REQ}" in before
    assert "Backlog" in before

    implementing_agent(monkeypatch)
    assert main(argv=["requirements", "run", REQ, "--workspace", str(root)]) == 0
    capsys.readouterr()

    assert main(argv=["requirements", "list", "--workspace", str(root)]) == 0
    after = capsys.readouterr().out
    assert "Review" in after


@verifies(SWR.SWR_3416)
def test_listing_a_workspace_without_a_store_says_so_and_still_exits_zero(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """An empty result is an answer the user asked for, not a failure."""
    code = main(argv=["requirements", "list", "--workspace", str(tmp_path)])
    captured = capsys.readouterr()

    assert code == 0
    assert captured.out == ""
    assert "No requirement store exists in" in captured.err


# --------------------------------------------------------------------------
# the run says what it was for, where sessions are listed
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3612)
def test_the_run_leaves_a_session_that_names_its_requirement_and_unit(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The end of the chain, read the way the session list reads it.

    ``list_sessions`` reads ``metadata.json`` and nothing else, so going through
    it exercises ``SessionState`` → the metadata write → the read back, over a
    session the shipped command actually created.
    """
    from rotaris_core.session.manager import SessionManager

    root = project(tmp_path / "checkout")
    implementing_agent(monkeypatch)

    assert main(argv=["requirements", "run", REQ, "--workspace", str(root)]) == 0

    listed = SessionManager(root).list_sessions()
    assert len(listed) == 1, listed
    assert listed[0]["requirement_id"] == REQ
    assert listed[0]["unit_id"], "a unit run names the unit it implemented"


@verifies(SWR.SWR_3612, SWR.SWR_3405)
def test_the_session_records_the_requirement_branch_it_ran_on(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Filing the session in the checkout is only half of it: name the tree too.

    ``config_service.refresh_sessions`` reads a row's branch out of
    ``metadata["worktree"]["branch"]`` and falls back to ``—``. A requirement run
    that recorded no worktree would therefore list with the new requirement badge
    beside a branch column claiming it has no branch, while it is in fact on a
    real requirement branch — and a resumed run would have nothing to point it
    back at its tree.
    """
    from rotaris_core.requirements.execution.run_seam import REQUIREMENT_BRANCH_PREFIX
    from rotaris_core.session.manager import SessionManager

    root = project(tmp_path / "checkout")
    implementing_agent(monkeypatch)

    assert main(argv=["requirements", "run", REQ, "--workspace", str(root)]) == 0

    listed = SessionManager(root).list_sessions()
    worktree = listed[0]["worktree"]
    assert worktree is not None, "a requirement run records the tree it ran in"
    assert worktree["branch"].startswith(REQUIREMENT_BRANCH_PREFIX), worktree["branch"]
    assert REQ.lower() in worktree["branch"].lower()
    # The tree it names is the run's own, never the checkout the session is
    # filed under (SWR-3405).
    assert Path(worktree["path"]).resolve() != root.resolve()
    # Provisioned by the run seam, not by the session: the session attached to a
    # tree that already existed and does not own its lifetime.
    assert worktree["created_by_session"] is False


@verifies(SWR.SWR_3612, SWR.SWR_3405)
def test_the_session_lives_in_the_checkout_and_not_in_the_worktree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A session filed in a requirement worktree is one no session list can show.

    The worktree is where the work happens; the checkout is where the run is
    recorded. Asserted on both sides, because the whole value of the attribution
    is that a user finds it without knowing a worktree existed.
    """
    from rotaris_core.session.manager import SessionManager

    root = project(tmp_path / "checkout")
    implementing_agent(monkeypatch)

    assert main(argv=["requirements", "run", REQ, "--workspace", str(root)]) == 0

    assert SessionManager(root).list_sessions(), "the checkout lists the run"
    worktrees = [
        Path(line.split()[0])
        for line in git(root, "worktree", "list").splitlines()
        if Path(line.split()[0]).resolve() != root.resolve()
    ]
    assert worktrees, "the run really did get a worktree of its own"
    for tree in worktrees:
        assert not SessionManager(tree).list_sessions(), f"{tree} holds a session nobody lists"


# --------------------------------------------------------------------------
# both entry points drive the same run
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3416)
def test_the_typer_surface_runs_the_same_requirement_the_headless_one_does(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Parity, checked rather than assumed: one composition behind two parsers."""
    from typer.testing import CliRunner

    from rotaris_core.cli.app import app

    root = project(tmp_path / "checkout")
    implementing_agent(monkeypatch)

    result = CliRunner().invoke(
        app,
        ["requirements", "run", REQ, "--workspace", str(root)],
    )

    assert result.exit_code == 0, result.output
    assert f"{REQ}: Review" in result.output
    assert DeliveryStore(root).read(REQ).state is DeliveryState.REVIEW


@verifies(SWR.SWR_3416)
def test_the_typer_surface_reports_an_unknown_requirement_the_same_way(
    tmp_path: Path,
) -> None:
    """The same exit code and the same sentence, from the other parser."""
    from typer.testing import CliRunner

    from rotaris_core.cli.app import app

    root = project(tmp_path / "checkout")

    result = CliRunner().invoke(
        app,
        ["requirements", "run", "SWR-9999", "--workspace", str(root)],
    )

    assert result.exit_code == 2
    assert "SWR-9999 is not in this project's requirement store" in result.output


@verifies(SWR.SWR_3416, SWR.SWR_3201)
def test_the_typer_surface_lists_the_same_requirements(tmp_path: Path) -> None:
    """``requirements list`` answers on both surfaces, and exits 0 when empty."""
    from typer.testing import CliRunner

    from rotaris_core.cli.app import app

    root = project(tmp_path / "checkout")
    runner = CliRunner()

    listed = runner.invoke(app, ["requirements", "list", "--workspace", str(root)])
    empty = runner.invoke(app, ["requirements", "list", "--workspace", str(tmp_path / "nowhere")])

    assert listed.exit_code == 0, listed.output
    assert REQ in listed.output
    assert "Backlog" in listed.output
    assert empty.exit_code == 0
    assert "No requirement store exists in" in empty.output


@verifies(SWR.SWR_3515, SWR.SWR_3502)
def test_evaluate_runs_the_propagation_pass_without_a_desktop(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    no_desktop_import: None,
) -> None:
    """Productive use: a CI job wants to know whether any delivered requirement drifted.
    Expected outcome: `requirements evaluate` runs the same pass the board runs — every
    rule, in the engine — over a checkout with no display and no desktop package."""
    root = project(tmp_path / "checkout")

    code = main(argv=["requirements", "evaluate", "--workspace", str(root)])
    captured = capsys.readouterr()

    assert code == 0, captured.err
    # Nothing has been delivered in this fixture, so nothing can have drifted. The
    # pass says so rather than saying nothing, which is the difference between a
    # quiet answer and a command that silently did not run.
    assert captured.out.strip() == "Nothing changed."


@verifies(SWR.SWR_3515)
def test_evaluating_a_workspace_without_a_store_says_so_and_still_exits_zero(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A directory that keeps no requirements is an answer, not a failure."""
    code = main(argv=["requirements", "evaluate", "--workspace", str(tmp_path / "nowhere")])
    captured = capsys.readouterr()

    assert code == 0
    assert captured.out == ""
    assert "No requirement store exists in" in captured.err


@verifies(SWR.SWR_3515, SWR.SWR_3502)
def test_evaluate_moves_a_delivered_requirement_whose_text_moved(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: somebody edited a delivered requirement and pushed.
    Expected outcome: the headless evaluation moves the card out of Done and names it —
    the same rule the board applies, with nobody looking at a board."""
    from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
    from rotaris_core.requirements.delivery.state import (
        DeliveryActor,
        DeliveryStatus,
        TransitionCause,
    )
    from rotaris_core.requirements.delivery.store import DeliveryRecord

    root = project(tmp_path / "checkout")
    spec = root / "docs" / "requirements" / "3400-requirement-execution" / f"{REQ}-headless.md"
    delivered_hash = _hash_of(root)
    DeliveryStore(root).seed(
        DeliveryRecord(
            req_id=REQ,
            delivery=DeliveryStatus(
                state=DeliveryState.DONE,
                changed_at=AT,
                changed_by=DeliveryActor.system("requirement-flow"),
                cause=TransitionCause.COMPLETION_ACCEPTED,
                requirement_hash=delivered_hash,
            ),
            satisfied=SatisfiedLog(
                entries=(
                    SatisfiedDelivery(
                        req_id=REQ,
                        satisfied_hash=delivered_hash,
                        run_id="run-1",
                        satisfied_at=AT,
                    ),
                ),
            ),
        ),
    )
    spec.write_text(
        spec.read_text(encoding="utf-8") + "\nA sixth failed attempt locks the account.\n",
        encoding="utf-8",
    )

    code = main(argv=["requirements", "evaluate", "--workspace", str(root)])
    captured = capsys.readouterr()

    assert code == 0, captured.err
    assert DeliveryStore(root).read(REQ).state is DeliveryState.NEEDS_UPDATE
    assert REQ in captured.err, captured.err
    assert "1 moved" in captured.out


def _hash_of(root: Path) -> str:
    """The requirement's content hash as the store computes it right now."""
    from rotaris_core.requirements.registry import RequirementRegistry
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    source = reqtocode_source_for(root)
    assert source is not None
    found = RequirementRegistry([source]).refresh().requirement(REQ)
    assert found is not None
    return found.current_hash


# --------------------------------------------------------------------------
# no desktop and no SDK in the import graph
# --------------------------------------------------------------------------

#: Import roots a headless command must not pull in at *import* time.
#:
#: The desktop half is SWR-3416's own line: a CLI that imports ``rotaris`` puts
#: the desktop app in the dependency path of the engine. The SDK half is the
#: import wall commit 8de9dac1 removed — ``openhands`` and ``litellm`` cost
#: seconds and belong behind a function body, so a command that reaches for them
#: to print a usage error has re-broken it. Both are checked in one place because
#: both are the same mistake: work done at import time that the command may never
#: need.
FORBIDDEN_AT_IMPORT = (
    "rotaris.",
    "PySide6",
    "PyQt",
    "shiboken",
    "openhands",
    "litellm",
)


def imports_of(*modules: str) -> str:
    """The forbidden roots a fresh interpreter loads when it imports *modules*.

    A fresh interpreter, always: a module another test already imported would
    otherwise be invisible here, and this guard is exactly about what is loaded
    and by whom.
    """
    program = textwrap.dedent(
        f"""
        import importlib
        import sys

        for name in {list(modules)!r}:
            module = importlib.import_module(name)
            assert module is not None, name

        forbidden = {FORBIDDEN_AT_IMPORT!r}
        offenders = sorted(
            {{
                name.split(".")[0]
                for name in sys.modules
                if name == "rotaris" or name.startswith(forbidden)
            }}
        )
        print(",".join(offenders))
        """,
    )
    completed = subprocess.run(
        [sys.executable, "-c", program],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    assert completed.returncode == 0, completed.stderr
    return completed.stdout.strip()


@verifies(SWR.SWR_3416)
def test_the_command_module_pulls_in_neither_qt_nor_the_desktop_package() -> None:
    """Checked in a fresh interpreter, so nothing another test imported can hide it."""
    assert (
        imports_of(
            "rotaris_core.cli.commands.requirements",
            "rotaris_core.requirements.execution.cli_host",
        )
        == ""
    )


@verifies(SWR.SWR_3416, SWR.SWR_1818)
def test_the_headless_command_does_not_pay_for_the_sdk_to_print_a_usage_error() -> None:
    """The import wall, guarded at the surface that grew after it was removed.

    ``analysis/`` is the new module set on this side of the epic, and its judge
    talks to a provider — so it is the obvious place for ``openhands`` or
    ``litellm`` to creep back to module scope. It is checked here beside the two
    command modules rather than in a test of its own, because what matters is not
    that one module is clean but that the *entry points* are.
    """
    assert (
        imports_of(
            "rotaris_core.cli.argparse_app",
            "rotaris_core.cli.commands.requirements",
            "rotaris_core.requirements.execution.cli_host",
            "rotaris_core.requirements.analysis.judge",
            "rotaris_core.requirements.analysis.persona",
            "rotaris_core.requirements.analysis.analysts",
        )
        == ""
    )


@verifies(SWR.SWR_3416, SWR.SWR_1818)
def test_the_headless_parser_still_imports_no_tui() -> None:
    """The argparse surface grew a group; it must not have grown a heavy import.

    ``typer`` is deliberately not an offender here: ``rotaris_core.cli`` is a
    barrel that imports the Typer app, so reaching any module inside the package
    pulls it in. What must stay out is everything that owns a terminal or a
    display, which is the same line ``test_argparse_does_not_import_tui`` draws.
    """
    program = textwrap.dedent(
        """
        import sys
        from rotaris_core.cli.argparse_app import _build_parser

        parser = _build_parser()
        parsed = parser.parse_args(["requirements", "run", "SWR-1"])
        assert parsed.requirements_command == "run"
        assert parsed.requirement == "SWR-1"
        offenders = sorted(
            name
            for name in sys.modules
            if name.startswith(("rotaris_core.tui", "textual", "PySide6", "openhands"))
        )
        print(",".join(offenders))
        """,
    )
    completed = subprocess.run(
        [sys.executable, "-c", program],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == ""


@pytest.mark.integration
@verifies(SWR.SWR_3509, SWR.SWR_3119, SWR.SWR_3113)
def test_a_deleted_requirement_is_reported_with_the_code_it_leaves_behind(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user deletes a requirement they no longer want and asks what it cost.
    Expected outcome: `requirements evaluate` names the id, the file it came from, and the code
    still claiming it — across two separate invocations, which is the only way a CLI ever sees a
    removal at all."""
    root = project(tmp_path / "checkout")
    # Code that claims the requirement, so its disappearance leaves something
    # behind. The annotation is assembled at runtime so this file never carries
    # the literal text this repository's own ReqToCode sweep looks for.
    trace = "traces"
    # The project declares where its code lives (SWR-2335). Without it the sweep
    # reads Rotaris' own layout — `src/rotaris_core` — and reports that a
    # requirement implemented in `src/` has no code at all.
    (root / ".reqtocode.json").write_text(
        '{"layout": {"impl_roots": ["src"], "test_roots": ["tests"]}}',
        encoding="utf-8",
    )
    (root / "src" / "seam.py").write_text(
        f'"""Seam."""\n\n\n@{trace}(SWR.SWR_{REQ.removeprefix("SWR-")})\n'
        "def start() -> None:\n    return None\n",
        encoding="utf-8",
    )

    # First invocation: reads the store and leaves its memory behind (SWR-3119).
    first = main(argv=["requirements", "evaluate", "--workspace", str(root)])
    opening = capsys.readouterr()
    assert first == 0, opening.err
    assert REQ not in opening.out, "a first read is not a removal"

    # The user deletes the requirement's own file.
    (root / "docs" / "requirements" / "3400-requirement-execution" / f"{REQ}-headless.md").unlink()

    # Second invocation: a separate process's worth of state, and it notices.
    second = main(argv=["requirements", "evaluate", "--workspace", str(root)])
    captured = capsys.readouterr()

    assert second == 0, captured.err
    # The summary counts it; the progress stream says what it was.
    assert "line(s) about what was removed" in captured.out
    shown = captured.err
    assert REQ in shown, "the deletion has to be visible to the person who made it"
    assert "removed" in shown
    assert "src/seam.py" in shown, "and so does the code that still claims it"

    # And it is retained, filed under the id the tombstone names (SWR-3509).
    records = AnalysisRecordStore(root).load(REQ).log.records
    assert [record.outcome for record in records] == ["removal-impact"]
    assert any(REQ in line for line in records[0].considered)


@verifies(SWR.SWR_3507, SWR.SWR_3416, SWR.SWR_3512)
def test_migrate_answers_the_same_way_on_both_surfaces_without_a_desktop(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    no_desktop_import: None,
) -> None:
    """Productive use: a CI job asks whether a migration worklist is waiting on a decision,
    and a user typing the same thing gets the same answer from the other surface.
    Expected outcome: both parsers drive one object — the same sentence, the same exit code,
    on a machine with no display and no desktop package. This is the command that made
    ``accept_migration`` reachable at all; before it, a worklist could be planned and never
    carried out."""
    from typer.testing import CliRunner

    from rotaris_core.cli.app import app

    root = project(tmp_path / "checkout")

    code = main(argv=["requirements", "migrate", "--workspace", str(root)])
    headless = capsys.readouterr()
    typed = CliRunner().invoke(app, ["requirements", "migrate", "--workspace", str(root)])

    assert code == 0, headless.err
    assert typed.exit_code == 0, typed.output
    assert "No migration worklist is waiting in" in headless.err
    assert "No migration worklist is waiting in" in typed.output


@verifies(SWR.SWR_3512, SWR.SWR_3416)
def test_migrating_without_an_actor_costs_exit_two_and_one_sentence(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user names a requirement and forgets to say who they are.
    Expected outcome: exit 2 and the flag to pass. ``require_human`` raises rather than
    returns, and a missing flag answered with a stack trace is not an answer."""
    root = project(tmp_path / "checkout")

    code = main(argv=["requirements", "migrate", REQ, "--workspace", str(root)])
    captured = capsys.readouterr()

    assert code == 2
    assert "--actor" in captured.err
    assert "Traceback" not in captured.err


@verifies(SWR.SWR_3507, SWR.SWR_3416)
def test_migrating_a_requirement_with_nothing_waiting_says_which_of_the_two_it_is(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user accepts a worklist that is not there — either because they
    mistyped the id, or because nothing has been planned for it yet.
    Expected outcome: two different sentences, because a typo and an empty queue are
    repaired differently."""
    root = project(tmp_path / "checkout")

    main(argv=["requirements", "migrate", REQ, "--workspace", str(root), "--actor", "ada"])
    known = capsys.readouterr()
    main(argv=["requirements", "migrate", "SWR-9999", "--workspace", str(root), "--actor", "ada"])
    unknown = capsys.readouterr()

    assert "no migration worklist is waiting" in known.err
    assert "is not in this project's requirement store" in unknown.err
