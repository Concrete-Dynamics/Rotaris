"""Membership resolution: epic expansion, excludes, and the one-owner rule."""

from __future__ import annotations

import pytest
from conftest import MANIFEST, write_manifest
from milestone_lib.manifest import parse_milestones
from milestone_lib.membership import (
    check_membership,
    epic_index_for,
    expand_epic,
    load_requirements,
    milestone_for,
    resolve_members,
)


def _milestone(tmp_path, body=MANIFEST, name="M1-first.md"):
    write_manifest(tmp_path, name, body)
    result = parse_milestones(tmp_path)
    assert result.errors == (), result.errors
    return result.milestones[0]


def test_an_epic_owns_its_folder_not_its_number_range(store):
    """SWR-900 lives in epic 100's folder, so it is epic 100's."""
    assert expand_epic(100, store) == {100, 101, 102, 103, 900}


def test_an_epic_does_not_own_a_neighbouring_epic(store):
    assert expand_epic(200, store) == {200, 201}


def test_an_unknown_epic_expands_to_nothing(store):
    assert expand_epic(9999, store) == frozenset()


def test_members_combine_epics_and_loose_ids_minus_excludes(tmp_path, store):
    milestone = _milestone(tmp_path)
    # epic 100 -> {100,101,102,103,900}; +201; -103; -101 (deprecated)
    assert resolve_members(milestone, store) == {100, 102, 900, 201}


def test_a_deprecated_member_drops_out_silently(tmp_path, store):
    milestone = _milestone(tmp_path)
    assert 101 not in resolve_members(milestone, store)


def test_a_requirement_outside_every_milestone_has_no_owner(tmp_path, store):
    milestone = _milestone(tmp_path)
    assert milestone_for(103, [milestone], store) is None


def test_branch_lookup_finds_the_claiming_milestone(tmp_path, store):
    milestone = _milestone(tmp_path)
    assert milestone_for(102, [milestone], store) is milestone


def test_a_closed_milestone_releases_its_claim(tmp_path, store):
    body = MANIFEST.replace(
        "status: active",
        'status: released\nreleased-version: "0.121.0"\nreleased-on: 2026-09-01',
    )
    milestone = _milestone(tmp_path, body)
    assert milestone_for(102, [milestone], store) is None


def test_two_open_milestones_may_not_claim_the_same_requirement(tmp_path, store):
    second = MANIFEST.replace("milestone: M1", "milestone: M2").replace(
        "milestone/m1-first", "milestone/m2-second"
    )
    write_manifest(tmp_path, "M1-first.md", MANIFEST)
    write_manifest(tmp_path, "M2-second.md", second)
    parsed = parse_milestones(tmp_path)
    errors = check_membership(parsed.milestones, store)
    assert any("already claimed by M1" in error for error in errors)


def test_a_dead_exclude_is_reported(tmp_path, store):
    body = MANIFEST.replace("excludes: [SWR-103]", "excludes: [SWR-201]")
    write_manifest(tmp_path, "M1-first.md", body)
    parsed = parse_milestones(tmp_path)
    errors = check_membership(parsed.milestones, store)
    assert any("dead exclude" in error for error in errors)


def test_an_id_outside_the_store_is_reported(tmp_path, store):
    body = MANIFEST.replace("requirements: [SWR-201]", "requirements: [SWR-4242]")
    write_manifest(tmp_path, "M1-first.md", body)
    parsed = parse_milestones(tmp_path)
    errors = check_membership(parsed.milestones, store)
    assert any("SWR-4242" in error and "not in the requirement store" in error for error in errors)


@pytest.mark.parametrize(
    ("source_path", "expected"),
    [
        (
            "docs/requirements/2900-event-store/SWR-2901-x.md",
            "docs/requirements/2900-event-store.md",
        ),
        ("docs/requirements/2900-event-store.md", "docs/requirements/2900-event-store.md"),
        ("docs/requirements/2300-traceability.md", "docs/requirements/2300-traceability.md"),
    ],
)
def test_epic_index_rule(source_path, expected):
    assert epic_index_for(source_path) == expected


def test_epic_index_matches_the_product_implementation(repo_root):
    """Pin the reimplementation against the product's own rule.

    ``milestone_lib`` reimplements ``epic_index_for`` so the tool stays
    stdlib-only; importing the product's version pulls in pydantic. This test
    runs under the full venv, so it can hold the two together across the whole
    real store.
    """
    from rotaris_core.requirements.sources.reqtocode import (
        epic_index_for as product_epic_index_for,
    )

    requirements, errors = load_requirements(repo_root)
    assert errors == ()
    assert len(requirements) > 1000
    for meta in requirements.values():
        assert epic_index_for(meta.source_path) == product_epic_index_for(
            meta.source_path, "docs/requirements"
        ), meta.source_path


def test_the_real_store_has_no_membership_violations(repo_root):
    requirements, errors = load_requirements(repo_root)
    assert errors == ()
    parsed = parse_milestones(repo_root)
    assert check_membership(parsed.milestones, requirements) == []
