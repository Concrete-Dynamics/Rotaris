"""The six gate checks, each isolated from the others."""

from __future__ import annotations

import pytest
from conftest import MANIFEST, make_req, write_manifest
from milestone_lib import gate as gate_module
from milestone_lib.gate import (
    Check,
    GateResult,
    _base_merged_check,
    _members_check,
    _tests_check,
    _versions_check,
    evaluate_gate,
)
from milestone_lib.manifest import parse_milestones
from milestone_lib.progress import progress_for

from rotaris_core.reqtocode.declarations import ReqStatus


def _milestone(tmp_path):
    write_manifest(tmp_path, "M1-first.md", MANIFEST)
    parsed = parse_milestones(tmp_path)
    assert parsed.errors == (), parsed.errors
    return parsed.milestones[0]


def _progress(tmp_path, store):
    return progress_for(_milestone(tmp_path), tmp_path, store, {})


def test_members_check_names_what_is_outstanding(tmp_path, store):
    check = _members_check(_progress(tmp_path, store))
    assert not check.ok
    assert "4 not approved" in check.detail
    assert "SWR-100" in check.detail


def test_members_check_truncates_a_long_list(tmp_path):
    store = {
        n: make_req(n, source_path=f"docs/requirements/100-alpha/SWR-{n}-x.md")
        for n in range(101, 112)
    }
    store[100] = make_req(100, source_path="docs/requirements/100-alpha.md")
    body = MANIFEST.replace("requirements: [SWR-201]", "requirements: []").replace(
        "excludes: [SWR-103]", "excludes: []"
    )
    write_manifest(tmp_path, "M1-first.md", body)
    milestone = parse_milestones(tmp_path).milestones[0]
    check = _members_check(progress_for(milestone, tmp_path, store, {}))
    assert "+7 more" in check.detail


def test_members_check_passes_when_everything_is_approved(tmp_path, store):
    approved = {
        n: make_req(
            n,
            source_path=store[n].source_path,
            status=ReqStatus.APPROVED,
        )
        for n in store
    }
    check = _members_check(_progress(tmp_path, approved))
    assert check.ok


def test_versions_check_names_every_wrong_manifest(tmp_path, store, monkeypatch):
    monkeypatch.setattr(
        gate_module,
        "declared_versions",
        lambda root: {"rotaris": "0.9.0", "rotaris-core": "0.121.0"},
    )
    check = _versions_check(tmp_path, _milestone(tmp_path))
    assert not check.ok
    assert "rotaris is 0.9.0" in check.detail
    assert "rotaris-core" not in check.detail


def test_versions_check_passes_when_both_match(tmp_path, monkeypatch):
    monkeypatch.setattr(
        gate_module,
        "declared_versions",
        lambda root: {"rotaris": "0.121.0", "rotaris-core": "0.121.0"},
    )
    assert _versions_check(tmp_path, _milestone(tmp_path)).ok


def test_base_merged_check_uses_the_supplied_runner(tmp_path):
    seen = []

    def runner(args, cwd):
        seen.append(list(args))
        return 0, ""

    check = _base_merged_check(tmp_path, "origin/master", runner)
    assert check.ok
    assert seen == [["merge-base", "--is-ancestor", "origin/master", "HEAD"]]


def test_base_merged_check_fails_when_the_base_is_not_an_ancestor(tmp_path):
    check = _base_merged_check(tmp_path, "origin/master", lambda args, cwd: (1, ""))
    assert not check.ok
    assert "not merged into this branch" in check.detail


@pytest.mark.parametrize(
    ("verdict", "expected"),
    [(True, True), (False, False), (None, False)],
)
def test_tests_check_needs_a_verdict(verdict, expected):
    assert _tests_check(verdict).ok is expected


def test_an_unsupplied_tests_verdict_says_how_to_supply_it():
    assert "--tests-passed" in _tests_check(None).detail


def test_gate_result_summary_reads_as_a_ratio():
    result = GateResult("M1", (Check("a", True, "fine"), Check("b", False, "broken")))
    assert not result.ok
    assert result.summary.startswith("1/2 — blocked on: b: broken")


def test_a_green_gate_says_ready():
    result = GateResult("M1", (Check("a", True, "fine"),))
    assert result.ok
    assert result.summary == "1/1 — ready to merge"


def test_evaluate_gate_runs_every_check_in_a_stable_order(tmp_path, store, monkeypatch):
    monkeypatch.setattr(
        gate_module, "verify", lambda root: type("R", (), {"ok": True, "errors": []})()
    )
    monkeypatch.setattr(
        gate_module,
        "compute_requirement_diff",
        lambda root, ref: type(
            "D", (), {"base_available": True, "errors": [], "drift_changes": []}
        )(),
    )
    monkeypatch.setattr(gate_module, "declared_versions", lambda root: {"rotaris": "0.121.0"})
    milestone = _milestone(tmp_path)
    result = evaluate_gate(
        milestone,
        tmp_path,
        progress_for(milestone, tmp_path, store, {}),
        tests_passed=True,
        runner=lambda args, cwd: (0, ""),
    )
    assert [check.name for check in result.checks] == [
        "members approved",
        "reqtocode clean",
        "no requirement drift",
        "versions match",
        "base merged in",
        "full suite green",
    ]
    # Only the member check is red, so the gate is red.
    assert not result.ok
    assert result.passed == 5


def test_drift_check_reports_an_unavailable_base(tmp_path, monkeypatch):
    monkeypatch.setattr(
        gate_module,
        "compute_requirement_diff",
        lambda root, ref: type(
            "D", (), {"base_available": False, "errors": [], "drift_changes": []}
        )(),
    )
    check = gate_module._drift_check(tmp_path, "origin/nope")
    assert not check.ok
    assert "not available" in check.detail


def test_versions_check_reports_a_missing_manifest_instead_of_crashing(tmp_path, monkeypatch):
    """A gate that raises tells nobody what is wrong. It must name the blocker."""

    def missing(root):
        raise FileNotFoundError(f"no manifest for rotaris-core at {root}/pyproject.toml")

    monkeypatch.setattr(gate_module, "declared_versions", missing)
    check = _versions_check(tmp_path, _milestone(tmp_path))
    assert not check.ok
    assert "cannot read the manifests" in check.detail
