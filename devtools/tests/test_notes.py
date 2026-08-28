"""Release-note grouping. Git is faked, so the grouping rule is what is tested."""

from __future__ import annotations

from conftest import MANIFEST, make_req, write_manifest
from milestone_lib.manifest import parse_milestones
from milestone_lib.notes import OTHER_CHANGES, grouped_changes
from milestone_lib.progress import progress_for


def _fake_git(subjects, previous="v0.120.0"):
    def runner(args, cwd):
        if args[0] == "describe":
            return (0, previous) if previous else (1, "")
        if args[0] == "log":
            return 0, "\n".join(subjects)
        return 1, ""

    return runner


def _setup(tmp_path, store):
    write_manifest(tmp_path, "M1-first.md", MANIFEST)
    milestone = parse_milestones(tmp_path).milestones[0]
    return milestone, progress_for(milestone, tmp_path, store, {})


def test_subjects_group_under_their_requirement(tmp_path, store):
    milestone, progress = _setup(tmp_path, store)
    body = grouped_changes(
        tmp_path,
        milestone,
        progress,
        runner=_fake_git(["feat: add the thing (SWR-102)", "fix: repair it (SWR-102)"]),
    )
    assert "### SWR-100 — Requirement 100" in body
    assert "- **SWR-102 — Requirement 102**" in body
    assert "  - feat: add the thing (SWR-102)" in body
    assert "  - fix: repair it (SWR-102)" in body


def test_a_subject_with_no_id_is_kept_under_other_changes(tmp_path, store):
    milestone, progress = _setup(tmp_path, store)
    body = grouped_changes(tmp_path, milestone, progress, runner=_fake_git(["chore: bump ruff"]))
    assert f"### {OTHER_CHANGES}" in body
    assert "- chore: bump ruff" in body


def test_an_id_outside_the_milestone_is_kept_not_dropped(tmp_path, store):
    milestone, progress = _setup(tmp_path, store)
    body = grouped_changes(
        tmp_path, milestone, progress, runner=_fake_git(["fix: unrelated (SWR-999)"])
    )
    assert "- fix: unrelated (SWR-999)" in body
    assert OTHER_CHANGES in body


def test_an_excluded_member_is_not_a_group(tmp_path, store):
    """SWR-103 is excluded, so its commits fall through to Other changes."""
    milestone, progress = _setup(tmp_path, store)
    body = grouped_changes(
        tmp_path, milestone, progress, runner=_fake_git(["feat: excluded work (SWR-103)"])
    )
    assert "**SWR-103" not in body
    assert "- feat: excluded work (SWR-103)" in body


def test_the_previous_tag_is_named(tmp_path, store):
    milestone, progress = _setup(tmp_path, store)
    body = grouped_changes(tmp_path, milestone, progress, runner=_fake_git(["feat: x (SWR-102)"]))
    assert "Everything merged since `v0.120.0`." in body


def test_an_explicit_base_overrides_the_previous_tag(tmp_path, store):
    milestone, progress = _setup(tmp_path, store)
    body = grouped_changes(
        tmp_path, milestone, progress, base="v0.1.0", runner=_fake_git(["feat: x (SWR-102)"])
    )
    assert "since `v0.1.0`" in body


def test_an_empty_range_says_so_instead_of_pretending(tmp_path, store):
    milestone, progress = _setup(tmp_path, store)
    body = grouped_changes(tmp_path, milestone, progress, runner=_fake_git([]))
    assert "No commits in" in body


def test_unapproved_members_are_declared_in_the_notes(tmp_path, store):
    milestone, progress = _setup(tmp_path, store)
    body = grouped_changes(tmp_path, milestone, progress, runner=_fake_git(["feat: x (SWR-102)"]))
    assert "Not delivered in this milestone" in body
    assert "SWR-102" in body


def test_a_complete_milestone_carries_no_shortfall_note(tmp_path, store):
    from rotaris_core.reqtocode.declarations import ReqStatus

    approved = {
        n: make_req(n, source_path=store[n].source_path, status=ReqStatus.APPROVED) for n in store
    }
    milestone, progress = _setup(tmp_path, approved)
    body = grouped_changes(tmp_path, milestone, progress, runner=_fake_git(["feat: x (SWR-102)"]))
    assert "Not delivered" not in body
