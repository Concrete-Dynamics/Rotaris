"""The command line: exit codes, and that each command answers the real repo."""

from __future__ import annotations

import milestone as cli
import pytest
from conftest import MANIFEST, write_manifest
from milestone_lib.manifest import MILESTONES_DIR

OK, VIOLATIONS, INTERNAL_ERROR = 0, 1, 2


@pytest.fixture
def fake_repo(tmp_path, store, monkeypatch):
    """A repo whose manifests are ours and whose requirement store is synthetic."""
    write_manifest(tmp_path, "M1-first.md", MANIFEST)
    monkeypatch.setattr(cli, "repo_root", lambda: tmp_path)
    monkeypatch.setattr(cli, "load_requirements", lambda root: (store, ()))
    return tmp_path


def test_check_is_green_on_a_valid_store(fake_repo, capsys):
    assert cli.main(["check"]) == OK
    assert "[milestone] OK" in capsys.readouterr().out


def test_check_reports_each_violation_and_fails(fake_repo, capsys):
    write_manifest(fake_repo, "M1-first.md", MANIFEST.replace("milestone/m1-first", "nope"))
    assert cli.main(["check"]) == VIOLATIONS
    captured = capsys.readouterr()
    assert "ERROR" in captured.err
    assert "FAIL: 1 violation(s)" in captured.out


def test_branch_for_prints_the_owning_branch(fake_repo, capsys):
    assert cli.main(["branch-for", "SWR-102"]) == OK
    assert capsys.readouterr().out.strip() == "milestone/m1-first"


def test_branch_for_prints_master_when_nothing_claims_it(fake_repo, capsys):
    assert cli.main(["branch-for", "SWR-103"]) == OK
    assert capsys.readouterr().out.strip() == "master"


def test_branch_for_accepts_a_bare_number(fake_repo, capsys):
    assert cli.main(["branch-for", "102"]) == OK
    assert capsys.readouterr().out.strip() == "milestone/m1-first"


def test_branch_for_refuses_a_non_id(fake_repo, capsys):
    assert cli.main(["branch-for", "the-event-store"]) == VIOLATIONS
    assert "not a SWR-<n> id" in capsys.readouterr().err


def test_branch_for_refuses_an_unknown_requirement(fake_repo, capsys):
    assert cli.main(["branch-for", "SWR-4242"]) == VIOLATIONS
    assert "not in the requirement store" in capsys.readouterr().err


def test_status_lists_every_milestone(fake_repo, capsys):
    assert cli.main(["status"]) == OK
    out = capsys.readouterr().out
    assert "M1  First" in out
    assert "SWR-102" in out


def test_status_refuses_an_unknown_milestone(fake_repo, capsys):
    assert cli.main(["status", "M9"]) == VIOLATIONS
    assert "no milestone M9" in capsys.readouterr().err


def test_gate_fails_and_names_its_blockers(fake_repo, capsys):
    assert cli.main(["gate", "M1"]) == VIOLATIONS
    out = capsys.readouterr().out
    assert "[ ] members approved" in out
    assert "blocker(s)" in out


def test_gate_refuses_an_unknown_milestone(fake_repo, capsys):
    assert cli.main(["gate", "M9"]) == VIOLATIONS
    assert "no milestone M9" in capsys.readouterr().err


def test_commands_refuse_to_run_on_a_broken_store(fake_repo, capsys):
    write_manifest(fake_repo, "M1-first.md", MANIFEST.replace("milestone/m1-first", "nope"))
    assert cli.main(["branch-for", "SWR-102"]) == VIOLATIONS
    assert "run `check` for the list" in capsys.readouterr().err


def test_pr_body_renders_the_marked_block(fake_repo, capsys):
    assert cli.main(["pr-body", "M1"]) == OK
    assert "<!-- milestone-status:start -->" in capsys.readouterr().out


def test_pr_body_preserves_prose_from_an_existing_body(fake_repo, tmp_path, capsys):
    existing = tmp_path / "body.md"
    existing.write_text("Human prose.\n\n<!-- milestone-status:start -->\nold\n", encoding="utf-8")
    assert cli.main(["pr-body", "M1", "--existing", str(existing)]) == OK
    out = capsys.readouterr().out
    assert out.startswith("Human prose.")
    assert "old" not in out


def test_an_unexpected_failure_is_the_two_in_the_contract(fake_repo, monkeypatch, capsys):
    def boom(root):
        raise RuntimeError("disk melted")

    monkeypatch.setattr(cli, "parse_milestones", boom)
    assert cli.main(["check"]) == INTERNAL_ERROR
    assert "INTERNAL ERROR: disk melted" in capsys.readouterr().err


def test_milestones_dir_is_not_part_of_the_requirement_store():
    """The manifests must sit outside docs/requirements/, or reqtocode would see them."""
    from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT

    assert not MILESTONES_DIR.as_posix().startswith(
        DEFAULT_LAYOUT.requirements_dir.as_posix() + "/"
    )


def test_the_real_repo_passes_check(capsys):
    assert cli.main(["check"]) == OK
    assert "[milestone] OK" in capsys.readouterr().out


def test_the_real_repo_answers_branch_for(capsys):
    assert cli.main(["branch-for", "SWR-2901"]) == OK
    assert capsys.readouterr().out.strip() == "milestone/m1-event-store"
