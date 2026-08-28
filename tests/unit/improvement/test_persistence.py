"""Tests for improvement artifact disk persistence.

REQ-20260515-POSTRUN-IMPROVE-T003.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.improvement.persistence import (
    improvement_artifact_dir,
    latest_improvement_artifact,
    list_improvement_artifact_ids,
    list_improvement_artifacts,
    load_improvement_artifact,
    save_improvement_artifact,
)
from rotaris_core.improvement.proposals import (
    ImprovementEvidence,
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
    new_artifact_id,
    new_proposal_id,
)
from rotaris_core.improvement.types import RunType
from rotaris_core.reqtocode import SWR, verifies


def _make_artifact() -> ImprovementProposalArtifact:
    return ImprovementProposalArtifact(
        artifact_id=new_artifact_id("seed"),
        source_session_id="sess",
        source_run_type=RunType.TASK_RUN,
        proposals=[
            ImprovementProposal(
                id=new_proposal_id(),
                category=ImprovementProposalCategory.WORKSPACE_NOTE,
                summary="x",
                recommended_action="y",
                evidence=[
                    ImprovementEvidence(
                        kind="transcript_observation",
                        text="evidence text",
                    ),
                ],
            ),
        ],
    )


@verifies(SWR.SWR_1602)
def test_save_and_load_round_trip(tmp_path: Path) -> None:
    artifact = _make_artifact()
    path = save_improvement_artifact(tmp_path, artifact)
    assert path.exists()
    assert path.parent.name == "improvement_artifacts"
    assert path.parent == improvement_artifact_dir(tmp_path)

    loaded = load_improvement_artifact(tmp_path, artifact.artifact_id)
    assert loaded.artifact_id == artifact.artifact_id
    assert loaded.source_session_id == "sess"
    assert loaded.proposals[0].summary == "x"


@verifies(SWR.SWR_1602)
def test_save_creates_directory_if_missing(tmp_path: Path) -> None:
    artifact = _make_artifact()
    save_improvement_artifact(tmp_path, artifact)
    assert (
        tmp_path / ".rotaris" / "improvement_artifacts" / f"{artifact.artifact_id}.json"
    ).exists()


@verifies(SWR.SWR_1602)
def test_list_returns_sorted_ids(tmp_path: Path) -> None:
    a1 = _make_artifact()
    a2 = _make_artifact()
    save_improvement_artifact(tmp_path, a1)
    save_improvement_artifact(tmp_path, a2)
    ids = list_improvement_artifact_ids(tmp_path)
    assert sorted(ids) == ids
    assert a1.artifact_id in ids
    assert a2.artifact_id in ids


@verifies(SWR.SWR_1602)
def test_list_returns_empty_when_no_artifacts(tmp_path: Path) -> None:
    assert list_improvement_artifact_ids(tmp_path) == []


@verifies(SWR.SWR_1602)
def test_load_missing_artifact_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_improvement_artifact(tmp_path, "impart_doesnotex")


@verifies(SWR.SWR_1602)
def test_save_rejects_malformed_artifact(tmp_path: Path) -> None:
    # Hand-build malformed payload to bypass Pydantic validators, then write it
    # directly and try to load — the loader re-validates.
    target_dir = tmp_path / ".rotaris" / "improvement_artifacts"
    target_dir.mkdir(parents=True)
    (target_dir / "impart_bad00000.json").write_text(
        json.dumps({"not": "an artifact"}),
        encoding="utf-8",
    )
    with pytest.raises(Exception):  # noqa: B017,PT011
        load_improvement_artifact(tmp_path, "impart_bad00000")


@verifies(SWR.SWR_1602)
def test_load_imports_legacy_session_local_artifact(tmp_path: Path) -> None:
    artifact = _make_artifact()
    legacy_dir = tmp_path / ".rotaris" / "sessions" / "sess" / "improvement_artifacts"
    legacy_dir.mkdir(parents=True)
    (legacy_dir / f"{artifact.artifact_id}.json").write_text(
        artifact.model_dump_json(indent=2),
        encoding="utf-8",
    )

    loaded = load_improvement_artifact(tmp_path, artifact.artifact_id)

    assert loaded.artifact_id == artifact.artifact_id
    assert (improvement_artifact_dir(tmp_path) / f"{artifact.artifact_id}.json").exists()


@verifies(SWR.SWR_1602)
def test_latest_improvement_artifact_prefers_newest_generated_at(tmp_path: Path) -> None:
    older = _make_artifact()
    import time

    time.sleep(0.01)
    newer = _make_artifact().model_copy(update={"source_session_id": "sess-2"})
    save_improvement_artifact(tmp_path, older)
    save_improvement_artifact(tmp_path, newer)

    latest = latest_improvement_artifact(tmp_path)

    assert latest is not None
    assert latest.artifact_id == newer.artifact_id


@verifies(SWR.SWR_1602)
def test_save_can_suppress_duplicate_open_proposals(tmp_path: Path) -> None:
    existing = _make_artifact()
    save_improvement_artifact(tmp_path, existing)

    duplicate = _make_artifact().model_copy(
        update={
            "artifact_id": new_artifact_id("dup"),
            "source_session_id": "sess-2",
        },
    )
    save_improvement_artifact(tmp_path, duplicate, suppress_duplicates=True)

    stored = load_improvement_artifact(tmp_path, duplicate.artifact_id)
    assert stored.proposals == []
    assert stored.notes is not None
    assert existing.proposals[0].id in stored.notes


@verifies(SWR.SWR_1602)
def test_list_improvement_artifacts_returns_newest_first(tmp_path: Path) -> None:
    first = _make_artifact()
    import time

    time.sleep(0.01)
    second = _make_artifact().model_copy(
        update={
            "artifact_id": new_artifact_id("second"),
            "source_session_id": "sess-2",
        },
    )
    save_improvement_artifact(tmp_path, first)
    save_improvement_artifact(tmp_path, second)

    artifacts = list_improvement_artifacts(tmp_path)

    assert [artifact.artifact_id for artifact in artifacts] == [
        second.artifact_id,
        first.artifact_id,
    ]
