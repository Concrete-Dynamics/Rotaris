"""Productive use: a user points the agent at a project without ever writing a
verifier config, and expects it to figure out how that project is tested.

Expected outcome: the checks that establish correctness (tests, typecheck) are
detected as blocking, style checks as advisory, each tagged with the marker file it
came from, and an unrecognizable project yields nothing rather than an error.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.detection import detect_check_suite, detect_checks

if TYPE_CHECKING:
    from pathlib import Path


def _by_name(root: Path) -> dict[str, tuple[str, str, str | None]]:
    return {
        check.name: (check.command, check.severity, check.detected_from)
        for check in detect_checks(root)
    }


@verifies(SWR.SWR_2601)
def test_no_markers_detects_nothing(tmp_path: Path) -> None:
    assert detect_checks(tmp_path) == []


@verifies(SWR.SWR_2601)
def test_pyproject_tool_tables_detect_pytest_mypy_and_ruff(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text(
        "[tool.pytest.ini_options]\naddopts = '-q'\n[tool.mypy]\nstrict = true\n[tool.ruff]\n",
        encoding="utf-8",
    )

    detected = _by_name(tmp_path)

    assert detected["pytest"] == ("pytest -q", "blocking", "pyproject.toml:pytest")
    assert detected["mypy"] == ("mypy .", "blocking", "pyproject.toml:mypy")
    assert detected["ruff"] == ("ruff check .", "advisory", "pyproject.toml:ruff")


@verifies(SWR.SWR_2601)
def test_a_tests_directory_alone_detects_pytest(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname = 'x'\n", encoding="utf-8")
    (tmp_path / "tests").mkdir()

    assert "pytest" in _by_name(tmp_path)


@verifies(SWR.SWR_2601)
def test_a_uv_lock_prefixes_python_commands_with_uv_run(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[tool.ruff]\n", encoding="utf-8")
    (tmp_path / "uv.lock").write_text("", encoding="utf-8")

    assert _by_name(tmp_path)["ruff"][0] == "uv run ruff check ."


@verifies(SWR.SWR_2601)
def test_a_malformed_pyproject_detects_nothing(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("this is not [ valid toml", encoding="utf-8")

    assert detect_checks(tmp_path) == []


@verifies(SWR.SWR_2601)
def test_package_json_detects_only_scripts_that_exist(tmp_path: Path) -> None:
    (tmp_path / "package.json").write_text(
        json.dumps({"scripts": {"test": "vitest run", "lint": "eslint .", "build": "vite build"}}),
        encoding="utf-8",
    )

    detected = _by_name(tmp_path)

    assert detected["npm:test"] == ("npm test", "blocking", "package.json:test")
    assert detected["npm:lint"] == ("npm run lint", "advisory", "package.json:lint")
    # `typecheck` is not declared, and `build` is deliberately never gated on.
    assert "npm:typecheck" not in detected
    assert "npm:build" not in detected


@verifies(SWR.SWR_2601)
def test_package_json_without_scripts_detects_nothing(tmp_path: Path) -> None:
    (tmp_path / "package.json").write_text(json.dumps({"name": "x"}), encoding="utf-8")

    assert detect_checks(tmp_path) == []


@verifies(SWR.SWR_2601)
def test_makefile_targets_detect_their_checks(tmp_path: Path) -> None:
    (tmp_path / "Makefile").write_text(
        "CC := gcc\n\ntest: deps\n\tpytest\n\nlint:\n\truff check .\n\ndocs:\n\tmkdocs build\n",
        encoding="utf-8",
    )

    detected = _by_name(tmp_path)

    assert detected["make:test"] == ("make test", "blocking", "Makefile:test")
    assert detected["make:lint"] == ("make lint", "advisory", "Makefile:lint")
    # `docs` is not a check we know how to interpret, and `CC :=` is not a target.
    assert set(detected) == {"make:test", "make:lint"}


@verifies(SWR.SWR_2601)
def test_a_polyglot_workspace_detects_every_marker(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[tool.mypy]\n", encoding="utf-8")
    (tmp_path / "package.json").write_text(
        json.dumps({"scripts": {"lint": "eslint ."}}),
        encoding="utf-8",
    )
    (tmp_path / "Makefile").write_text("test:\n\tpytest\n", encoding="utf-8")

    assert set(_by_name(tmp_path)) == {"mypy", "npm:lint", "make:test"}


@verifies(SWR.SWR_2608)
def test_a_makefile_alias_of_an_already_detected_tool_is_not_run_twice(tmp_path: Path) -> None:
    """A workspace declaring its tests twice still runs them once.

    This is the shape that made one iteration run the whole test suite twice:
    `pyproject.toml` yields `pytest`, and the `Makefile` yields `make test` for
    the same work.
    """
    (tmp_path / "pyproject.toml").write_text(
        "[tool.pytest.ini_options]\n[tool.mypy]\n[tool.ruff]\n",
        encoding="utf-8",
    )
    (tmp_path / "Makefile").write_text(
        "test:\n\tpytest\n\ntypecheck:\n\tmypy .\n\nlint:\n\truff check .\n",
        encoding="utf-8",
    )

    result = detect_check_suite(tmp_path)

    # One check per role, still — and the *declared* one wins each of them
    # (SWR-2620): only the project knows what its own `test` target really runs.
    assert [check.name for check in result.checks] == ["make:test", "make:typecheck", "make:lint"]
    assert [check.role for check in result.checks] == ["test", "typecheck", "lint"]
    assert [check.origin for check in result.checks] == ["declared", "declared", "declared"]
    # Suppressing a check must not erase the evidence that its marker exists.
    assert "Makefile:test" in result.detections
    assert "Makefile:typecheck" in result.detections
    assert "Makefile:lint" in result.detections
    # …and the synthesized command is kept, as the fallback for a host that
    # cannot run `make` at all.
    assert [check.name for check in result.checks[0].alternatives] == ["pytest"]


@verifies(SWR.SWR_2608)
def test_a_makefile_target_still_wins_a_role_no_other_marker_claimed(tmp_path: Path) -> None:
    """Deduplication removes duplicates, not coverage."""
    (tmp_path / "pyproject.toml").write_text("[tool.ruff]\n", encoding="utf-8")
    (tmp_path / "Makefile").write_text("test:\n\tpytest\n", encoding="utf-8")

    result = detect_check_suite(tmp_path)

    assert [check.name for check in result.checks] == ["ruff", "make:test"]


# -- which command wins a role, and what happens to the losers (SWR-2620) ---


@verifies(SWR.SWR_2620)
def test_a_declared_command_wins_and_keeps_the_synthesized_one_as_a_fallback(
    tmp_path: Path,
) -> None:
    """Productive use: this repository's own shape.

    `pyproject.toml` yields a synthesized `pytest -q`; the `Makefile` states what
    the project actually runs — parallel, with a per-test timeout. Verifying with
    the synthesized one took several times longer, outgrew its budget and was
    killed, and 1413 requirements were refused on the strength of it.
    """
    (tmp_path / "pyproject.toml").write_text(
        "[tool.pytest.ini_options]\n",
        encoding="utf-8",
    )
    (tmp_path / "Makefile").write_text(
        "test:\n\tpytest -q --timeout=120 -n auto\n",
        encoding="utf-8",
    )

    chosen = detect_check_suite(tmp_path).checks[0]

    assert chosen.command == "make test"
    assert chosen.origin == "declared"
    assert [alternative.command for alternative in chosen.alternatives] == ["pytest -q"]
    assert chosen.alternatives[0].origin == "synthesized"


@verifies(SWR.SWR_2620)
def test_with_nothing_declared_the_synthesized_command_stands_alone(tmp_path: Path) -> None:
    """A project that wrote nothing down is not punished for it."""
    (tmp_path / "pyproject.toml").write_text("[tool.pytest.ini_options]\n", encoding="utf-8")

    chosen = detect_check_suite(tmp_path).checks[0]

    assert chosen.command == "pytest -q"
    assert chosen.origin == "synthesized"
    assert chosen.alternatives == ()


@verifies(SWR.SWR_2620)
def test_a_synthesized_command_uses_the_scope_the_tool_config_states(tmp_path: Path) -> None:
    """Productive use: a project that type-checks `src/` and nothing else.

    `mypy .` walked `examples/`, fixtures and scratch trees this project has never
    type-checked, and failed on them — a blocking check red for reasons the
    project does not consider failures.
    """
    (tmp_path / "pyproject.toml").write_text(
        '[tool.mypy]\nfiles = ["src", "apps"]\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
        encoding="utf-8",
    )

    commands = {check.name: check.command for check in detect_check_suite(tmp_path).checks}

    assert commands["mypy"] == "mypy src apps"
    assert commands["pytest"] == "pytest -q tests"


@verifies(SWR.SWR_2620)
def test_a_config_that_states_no_scope_leaves_the_default_alone(tmp_path: Path) -> None:
    """An invented narrow scope would be worse than an honest wide one."""
    (tmp_path / "pyproject.toml").write_text("[tool.mypy]\nstrict = true\n", encoding="utf-8")

    commands = {check.name: check.command for check in detect_check_suite(tmp_path).checks}

    assert commands["mypy"] == "mypy ."
