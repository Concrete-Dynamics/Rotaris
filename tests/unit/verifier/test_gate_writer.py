"""Productive use: something — detection, a repair loop, an authoring persona, an
approved proposal — wants to change the quality gate of a workspace a person
owns.

Expected outcome: the change lands in `verifier.checks` and nowhere else in the
file; anything that would *weaken* the gate is refused and routed to an approval
instead; and a workspace git does not track keeps a copy of what it had.

The refusals are the point. They are enforced here, at the write, rather than
asked for in a prompt — which is what makes it safe to let an agent hold the pen.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
import yaml

from rotaris_core.config.schema import CheckConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.gate_writer import (
    authorize_gate_write,
    read_verifier_section,
    write_verifier_section,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _check(
    name: str = "pytest",
    command: str = "uv run pytest -q",
    *,
    role: str | None = "test",
    severity: str = "blocking",
) -> CheckConfig:
    return CheckConfig(
        name=name,
        command=command,
        role=role,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
    )


_EXISTING = """\
default_persona: orchestrator
small_model: gpt-4o-mini

# The user's own note about their models. This has to survive.
models:
  gpt-4o-mini:
    provider: openai

personas:
  coding-agent:
    model: large_model
"""


def _workspace(tmp_path: Path, *, agents_yaml: str = _EXISTING) -> Path:
    directory = tmp_path / ".rotaris"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "agents.yaml").write_text(agents_yaml, encoding="utf-8")
    return tmp_path


# -- the authority rule ------------------------------------------------------


@verifies(SWR.SWR_2614)
def test_adding_a_check_is_automatic() -> None:
    """Strengthening a gate needs nobody's permission."""
    authority = authorize_gate_write(
        [_check()],
        [_check(), _check("mypy", "mypy src/", role="typecheck")],
    )

    assert authority.allowed


@verifies(SWR.SWR_2614)
def test_replacing_a_command_within_the_same_role_and_severity_is_automatic() -> None:
    """The case SWR-2616's deterministic repair depends on.

    A renamed `make test` target swapped for a probed `pytest` is the same
    promise about the same role, and forcing it through an approval would leave
    the workspace unverified until somebody clicked.
    """
    authority = authorize_gate_write(
        [_check("make:test", "make test")],
        [_check("pytest", "uv run pytest -q")],
    )

    assert authority.allowed


@verifies(SWR.SWR_2614)
def test_emptying_the_suite_is_refused() -> None:
    """How a workspace stops being verified. That has to be somebody's decision."""
    authority = authorize_gate_write([_check()], [])

    assert authority.needs_approval
    assert "emptying the check suite" in authority.reason


@verifies(SWR.SWR_2614)
def test_removing_a_roles_only_check_is_refused() -> None:
    """A gate quietly losing a role is indistinguishable from one that never had it."""
    authority = authorize_gate_write(
        [_check(), _check("mypy", "mypy src/", role="typecheck")],
        [_check()],
    )

    assert authority.needs_approval
    assert "typecheck" in authority.reason


@verifies(SWR.SWR_2614)
def test_lowering_a_check_from_blocking_to_advisory_is_refused() -> None:
    """An advisory check is reported and never gates.

    Demoting one turns the gate off without removing it, which is the quietest
    way to end up with a gate that verifies nothing.
    """
    authority = authorize_gate_write([_check()], [_check(severity="advisory")])

    assert authority.needs_approval
    assert "blocking to advisory" in authority.reason


@verifies(SWR.SWR_2614)
def test_a_check_that_states_no_role_is_its_own_slot() -> None:
    """A hand-written suite states exactly what it wants run.

    Treating two unrelated unstated checks as interchangeable would let one
    silently replace the other.
    """
    refused = authorize_gate_write(
        [_check("smoke", "./smoke.sh", role=None)],
        [_check("soak", "./soak.sh", role=None)],
    )

    assert refused.needs_approval
    assert "smoke" in refused.reason


@verifies(SWR.SWR_2614, SWR.SWR_2615)
def test_a_workspace_with_no_gate_yet_is_unconstrained() -> None:
    """There is nothing to weaken, and refusing here would make authoring impossible."""
    assert authorize_gate_write([], [_check()]).allowed


# -- the write ---------------------------------------------------------------


@verifies(SWR.SWR_2614)
def test_a_write_replaces_the_verifier_section_and_leaves_the_file_alone(
    tmp_path: Path,
) -> None:
    """Everything else in the file is somebody's configuration, not ours."""
    root = _workspace(tmp_path)

    outcome = write_verifier_section(root, [_check()], reason="detected a test suite")

    assert outcome.written
    document = yaml.safe_load((root / ".rotaris" / "agents.yaml").read_text(encoding="utf-8"))
    assert document["verifier"]["checks"][0]["name"] == "pytest"
    assert document["default_persona"] == "orchestrator"
    assert document["models"]["gpt-4o-mini"]["provider"] == "openai"
    assert document["personas"]["coding-agent"]["model"] == "large_model"


@verifies(SWR.SWR_2614)
def test_a_refused_write_changes_nothing_on_disk(tmp_path: Path) -> None:
    root = _workspace(tmp_path)
    write_verifier_section(root, [_check()], reason="first")
    before = (root / ".rotaris" / "agents.yaml").read_text(encoding="utf-8")

    outcome = write_verifier_section(root, [], reason="give up")

    assert not outcome.written
    assert "emptying" in outcome.refusal
    assert (root / ".rotaris" / "agents.yaml").read_text(encoding="utf-8") == before


@verifies(SWR.SWR_2614, SWR.SWR_2617)
def test_an_approved_change_may_do_what_the_automatic_path_may_not(tmp_path: Path) -> None:
    """The escape hatch, and the only one: a person already approved this.

    Without it the refusals would not be a routing rule, they would be a wall,
    and a user could never retire a check.
    """
    root = _workspace(tmp_path)
    write_verifier_section(root, [_check()], reason="first")

    outcome = write_verifier_section(root, [], reason="the user retired it", authorize=False)

    assert outcome.written
    assert outcome.after == ()


@verifies(SWR.SWR_2614)
def test_an_untracked_workspace_gets_a_copy_of_what_it_had_first(tmp_path: Path) -> None:
    """Git is the audit trail everywhere else. Where there is none, this is."""
    root = _workspace(tmp_path)

    outcome = write_verifier_section(root, [_check()], reason="detected")

    assert outcome.backup
    assert "verifier" not in (root / ".rotaris" / "agents.yaml.bak").read_text(encoding="utf-8")


@verifies(SWR.SWR_2614)
def test_a_tracked_workspace_gets_no_backup_because_git_already_is_one(
    tmp_path: Path,
) -> None:
    """Otherwise every write would litter a repository with `.bak` files.

    Pinned rather than assumed: a git check that silently always answered "not
    tracked" would pass the untracked test above and be a no-op in every real
    workspace.
    """
    import subprocess

    root = _workspace(tmp_path)
    for argv in (
        ["git", "init", "-q"],
        ["git", "add", ".rotaris/agents.yaml"],
    ):
        subprocess.run(argv, cwd=root, check=True, capture_output=True)  # noqa: S603

    outcome = write_verifier_section(root, [_check()], reason="detected")

    assert outcome.written
    assert outcome.backup == ""
    assert not (root / ".rotaris" / "agents.yaml.bak").exists()


@verifies(SWR.SWR_2614)
def test_a_workspace_with_no_configuration_at_all_gets_one(tmp_path: Path) -> None:
    """SWR-2615 authors gates for workspaces that start from nothing."""
    outcome = write_verifier_section(tmp_path, [_check()], reason="techstack appeared")

    assert outcome.written
    assert read_verifier_section(tmp_path) == (_check(),)


@verifies(SWR.SWR_2614)
def test_an_unwritable_workspace_keeps_the_gate_it_had(tmp_path: Path, monkeypatch) -> None:
    """The invariant the whole lane rests on: a failure never changes the gate."""
    root = _workspace(tmp_path)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise OSError("read-only file system")

    monkeypatch.setattr("rotaris_core.verifier.gate_writer.atomic_write", _explode)

    outcome = write_verifier_section(root, [_check()], reason="detected")

    assert not outcome.written
    assert "could not be written" in outcome.refusal
    assert read_verifier_section(root) is None


# -- reading -----------------------------------------------------------------


@verifies(SWR.SWR_2614, SWR.SWR_2601)
def test_an_unset_suite_and_an_explicitly_empty_one_stay_different(tmp_path: Path) -> None:
    """`None` means detect one; `[]` means this workspace runs no verification.

    Collapsing them is precisely the confusion SWR-2612 exists to end.
    """
    unset = _workspace(tmp_path / "a")
    assert read_verifier_section(unset) is None

    empty = _workspace(tmp_path / "b", agents_yaml="verifier:\n  checks: []\n")
    assert read_verifier_section(empty) == ()


@verifies(SWR.SWR_2614)
def test_one_unreadable_check_does_not_lose_the_others(tmp_path: Path) -> None:
    root = _workspace(
        tmp_path,
        agents_yaml=(
            "verifier:\n"
            "  checks:\n"
            "    - name: pytest\n"
            "      command: pytest -q\n"
            "    - name: broken\n"  # no command
            "    - name: ruff\n"
            "      command: ruff check .\n"
        ),
    )

    assert [check.name for check in read_verifier_section(root) or ()] == ["pytest", "ruff"]
