"""Aggregation of a milestone's members."""

from __future__ import annotations

from dataclasses import dataclass

from conftest import MANIFEST, write_manifest
from milestone_lib.manifest import parse_milestones
from milestone_lib.progress import progress_for

from rotaris_core.reqtocode.declarations import ReqStatus


@dataclass(frozen=True)
class FakeCoverage:
    is_traced: bool
    is_test_covered: bool


def _milestone(tmp_path, body=MANIFEST):
    write_manifest(tmp_path, "M1-first.md", body)
    parsed = parse_milestones(tmp_path)
    assert parsed.errors == (), parsed.errors
    return parsed.milestones[0]


def test_counts_reflect_member_state(tmp_path, store):
    milestone = _milestone(tmp_path)
    coverage = {100: FakeCoverage(False, False), 102: FakeCoverage(True, True)}
    progress = progress_for(milestone, tmp_path, store, coverage)

    assert progress.total == 4  # 100, 102, 900, 201
    assert progress.done == 0
    assert progress.traced == 1
    assert progress.covered == 1
    assert progress.percent == 0


def test_percent_and_done_track_approval(tmp_path, store):
    approved = dict(store)
    for number in (100, 102, 900, 201):
        approved[number] = type(approved[number])(
            **{**approved[number].__dict__, "status": ReqStatus.APPROVED}
        )
    milestone = _milestone(tmp_path)
    progress = progress_for(milestone, tmp_path, approved, {})
    assert progress.done == progress.total == 4
    assert progress.percent == 100
    assert progress.outstanding == ()


def test_an_empty_milestone_is_zero_percent_not_hundred(tmp_path, store):
    body = (
        MANIFEST.replace("epics: [SWR-100]", "epics: [SWR-200]")
        .replace("requirements: [SWR-201]", "requirements: []")
        .replace("excludes: [SWR-103]", "excludes: [SWR-200, SWR-201]")
    )
    milestone = _milestone(tmp_path, body)
    progress = progress_for(milestone, tmp_path, store, {})
    assert progress.total == 0
    assert progress.percent == 0


def test_members_group_by_epic_index(tmp_path, store):
    milestone = _milestone(tmp_path)
    progress = progress_for(milestone, tmp_path, store, {})
    headings = [group.heading for group in progress.groups]
    assert headings == ["SWR-100 — Requirement 100", "SWR-200 — Requirement 200"]
    assert [m.number for m in progress.groups[0].members] == [100, 102, 900]
    assert [m.number for m in progress.groups[1].members] == [201]


def test_outstanding_names_only_unapproved_members(tmp_path, store):
    milestone = _milestone(tmp_path)
    progress = progress_for(milestone, tmp_path, store, {})
    assert {m.number for m in progress.outstanding} == {100, 102, 900, 201}


def test_the_real_m1_aggregates(repo_root):
    from milestone_lib.membership import load_requirements

    requirements, errors = load_requirements(repo_root)
    assert errors == ()
    milestone = parse_milestones(repo_root).by_id("M1")
    progress = progress_for(milestone, repo_root, requirements)
    assert progress.total > 0
    assert progress.done + len(progress.outstanding) == progress.total
