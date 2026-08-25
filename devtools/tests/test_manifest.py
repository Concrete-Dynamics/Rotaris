"""Shape validation of the milestone manifests."""

from __future__ import annotations

from conftest import MANIFEST, write_manifest
from milestone_lib.manifest import MilestoneStatus, parse_milestones


def test_a_well_formed_manifest_parses(tmp_path):
    write_manifest(tmp_path, "M1-first.md", MANIFEST)
    result = parse_milestones(tmp_path)
    assert result.errors == ()
    milestone = result.by_id("M1")
    assert milestone is not None
    assert milestone.status is MilestoneStatus.ACTIVE
    assert milestone.branch == "milestone/m1-first"
    assert milestone.epics == (100,)
    assert milestone.requirements == (201,)
    assert milestone.excludes == (103,)
    assert milestone.tag == "v0.121.0"
    assert milestone.is_open


def test_readme_and_template_are_not_milestones(tmp_path):
    write_manifest(tmp_path, "M1-first.md", MANIFEST)
    write_manifest(tmp_path, "README.md", "# Milestones\n")
    write_manifest(tmp_path, "TEMPLATE.md", "# Template\n")
    result = parse_milestones(tmp_path)
    assert result.errors == ()
    assert [m.milestone_id for m in result.milestones] == ["M1"]


def test_branch_must_follow_the_filename(tmp_path):
    write_manifest(tmp_path, "M1-first.md", MANIFEST.replace("milestone/m1-first", "release/one"))
    result = parse_milestones(tmp_path)
    assert any("expected 'milestone/m1-first'" in error for error in result.errors)


def test_id_must_follow_the_filename(tmp_path):
    write_manifest(tmp_path, "M2-first.md", MANIFEST)
    result = parse_milestones(tmp_path)
    assert any("expected 'M2'" in error for error in result.errors)


def test_prerelease_target_version_is_refused(tmp_path):
    write_manifest(tmp_path, "M1-first.md", MANIFEST.replace('"0.121.0"', '"0.121.0a1"'))
    result = parse_milestones(tmp_path)
    assert any("no prerelease" in error for error in result.errors)
    assert result.milestones == ()


def test_released_needs_its_provenance(tmp_path):
    write_manifest(tmp_path, "M1-first.md", MANIFEST.replace("status: active", "status: released"))
    result = parse_milestones(tmp_path)
    assert any("released-version" in error for error in result.errors)
    assert any("released-on" in error for error in result.errors)


def test_release_provenance_without_release_status_is_refused(tmp_path):
    body = MANIFEST.replace("opened: 2026-08-25", 'opened: 2026-08-25\nreleased-version: "0.121.0"')
    write_manifest(tmp_path, "M1-first.md", body)
    result = parse_milestones(tmp_path)
    assert any("only for status: released" in error for error in result.errors)


def test_a_milestone_must_name_something(tmp_path):
    body = MANIFEST.replace("epics: [SWR-100]", "epics: []").replace(
        "requirements: [SWR-201]", "requirements: []"
    )
    write_manifest(tmp_path, "M1-first.md", body)
    result = parse_milestones(tmp_path)
    assert any("at least one epic or requirement" in error for error in result.errors)


def test_an_id_named_twice_is_refused(tmp_path):
    body = MANIFEST.replace("requirements: [SWR-201]", "requirements: [SWR-201, SWR-201]")
    write_manifest(tmp_path, "M1-first.md", body)
    result = parse_milestones(tmp_path)
    assert any("more than once" in error for error in result.errors)


def test_an_id_that_is_both_epic_and_requirement_is_refused(tmp_path):
    body = MANIFEST.replace("requirements: [SWR-201]", "requirements: [SWR-100]")
    write_manifest(tmp_path, "M1-first.md", body)
    result = parse_milestones(tmp_path)
    assert any("both an epic and a requirement" in error for error in result.errors)


def test_a_wrapped_flow_list_still_parses(tmp_path):
    body = MANIFEST.replace(
        "requirements: [SWR-201]", "requirements: [SWR-201,\n  SWR-202,\n  SWR-203]"
    )
    write_manifest(tmp_path, "M1-first.md", body)
    result = parse_milestones(tmp_path)
    assert result.errors == ()
    assert result.by_id("M1").requirements == (201, 202, 203)


def test_a_file_without_frontmatter_is_an_error(tmp_path):
    write_manifest(tmp_path, "M1-first.md", "# M1 — First\n")
    result = parse_milestones(tmp_path)
    assert any("no frontmatter" in error for error in result.errors)


def test_a_missing_directory_is_reported_not_crashed(tmp_path):
    result = parse_milestones(tmp_path)
    assert result.milestones == ()
    assert any("does not exist" in error for error in result.errors)


def test_the_real_store_is_valid(repo_root):
    """The manifests actually checked in must parse cleanly."""
    result = parse_milestones(repo_root)
    assert result.errors == ()
    assert {m.milestone_id for m in result.milestones} >= {"M1", "M2"}
