"""Requirement-diff trigger tests (SWR-2332): classification + strict drift gate."""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.declarations import ReqMeta, ReqStatus
from rotaris_core.reqtocode.diff import classify_changes, compute_requirement_diff
from rotaris_core.reqtocode.generator import regenerate_if_stale
from rotaris_core.reqtocode.verifier import Occurrence

if TYPE_CHECKING:
    from pathlib import Path


def _meta(number: int, content_hash: str, status: ReqStatus = ReqStatus.APPROVED) -> ReqMeta:
    return ReqMeta(
        req_id=f"SWR-{number}",
        number=number,
        status=status,
        title=f"Demo {number}",
        source_path=f"docs/requirements/100-demo/SWR-{number}.md",
        trace_required=True,
        test_required=True,
        content_hash=content_hash,
    )


def _site(number: int, file: str = "src/rotaris_core/feature.py") -> Occurrence:
    return Occurrence(number=number, file=file, line=10, kind="traces")


@verifies(SWR.SWR_2332)
def test_classify_added_removed_modified_status() -> None:
    current = [
        _meta(101, "hashA"),  # unchanged
        _meta(102, "hashNEW"),  # modified (base hashOLD)
        _meta(103, "hashC", ReqStatus.APPROVED),  # status change from draft
        _meta(104, "hashD"),  # added
    ]
    base = {
        101: _meta(101, "hashA"),
        102: _meta(102, "hashOLD"),
        103: _meta(103, "hashC", ReqStatus.DRAFT),
        105: _meta(105, "hashE"),  # removed (not in current)
    }
    sites = {102: [_site(102)], 105: [_site(105)]}
    changes = {c.number: c for c in classify_changes(current, base, sites, changed_files=set())}

    assert 101 not in changes  # unchanged requirements produce no work
    assert changes[102].kind == "modified"
    assert changes[103].kind == "status"
    assert changes[103].status_from == "draft"
    assert changes[104].kind == "added"
    assert changes[105].kind == "removed"


@verifies(SWR.SWR_2332)
def test_modified_without_touching_site_is_drift() -> None:
    current = [_meta(102, "hashNEW")]
    base = {102: _meta(102, "hashOLD")}
    sites = {102: [_site(102, "src/rotaris_core/feature.py")]}

    # Requirement text changed but the implementing file was NOT in the changeset.
    drifted = classify_changes(current, base, sites, changed_files={"docs/requirements/x.md"})
    assert drifted[0].drift is True

    # Same change, but the implementing file WAS touched -> propagated, no drift.
    ok = classify_changes(current, base, sites, changed_files={"src/rotaris_core/feature.py"})
    assert ok[0].drift is False


@verifies(SWR.SWR_2332)
def test_drift_only_applies_to_approved_with_sites() -> None:
    current_draft = [_meta(102, "hashNEW", ReqStatus.DRAFT)]
    base = {102: _meta(102, "hashOLD", ReqStatus.DRAFT)}
    sites = {102: [_site(102)]}
    assert classify_changes(current_draft, base, sites, set())[0].drift is False

    current_no_sites = [_meta(103, "hashNEW")]
    base_no_sites = {103: _meta(103, "hashOLD")}
    assert classify_changes(current_no_sites, base_no_sites, {}, set())[0].drift is False


def _git(root: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True)


def _write_req(root: Path, number: int, body: str) -> None:
    folder = root / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"SWR-{number}-demo.md").write_text(
        f"---\nreq-id: SWR-{number}\nstatus: approved\ntrace: optional\ntest: optional\n"
        f'title: "Demo {number}"\n---\n\n# SWR-{number} - Demo {number}\n\n{body}\n',
        encoding="utf-8",
    )


@verifies(SWR.SWR_2332)
def test_compute_diff_against_committed_base(tmp_path: Path) -> None:
    _git(tmp_path, "init")
    _git(tmp_path, "config", "user.email", "t@t.t")
    _git(tmp_path, "config", "user.name", "t")
    _write_req(tmp_path, 101, "Original requirement text.")
    regenerate_if_stale(tmp_path)  # produces the committed swr.py snapshot
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-m", "base")

    # Edit the requirement text in the worktree (no code touched).
    _write_req(tmp_path, 101, "Changed requirement text.")
    result = compute_requirement_diff(tmp_path, base_ref="HEAD")

    assert result.base_available is True
    assert result.errors == []
    (change,) = result.changes
    assert change.number == 101
    assert change.kind == "modified"


@verifies(SWR.SWR_2332)
def test_compute_diff_reports_missing_base(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, "Text.")
    # No git repo / no committed swr.py -> degrade gracefully, never crash.
    result = compute_requirement_diff(tmp_path, base_ref="HEAD")
    assert result.base_available is False
    assert result.changes == []
