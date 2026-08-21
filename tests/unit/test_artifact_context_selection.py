from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from rotaris_core.orchestrator.artifacts import ArtifactRecord, SessionArtifactStore
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


def _store_with_records(tmp_path: Path, records: list[ArtifactRecord]) -> SessionArtifactStore:
    store = SessionArtifactStore(tmp_path)
    for record in records:
        store._records[record.id] = record
        store._by_slug[record.slug] = record.id
    return store


def _record(
    art_id: str,
    slug: str,
    *,
    summary: str,
    status: str = "succeeded",
    minutes: int = 0,
    tags: list[str] | None = None,
) -> ArtifactRecord:
    return ArtifactRecord(
        id=art_id,
        slug=slug,
        title=slug,
        status=status,
        summary=summary,
        tags=tags or [],
        created_at=dt.datetime(2026, 5, 27, 10, minutes, tzinfo=dt.UTC),
    )


@verifies(SWR.SWR_114, SWR.SWR_1526, SWR.SWR_1318)
def test_baseline_block_prefers_newest_relevant_artifact(tmp_path: Path) -> None:
    store = _store_with_records(
        tmp_path,
        [
            _record("art_old", "old-generic", summary="general setup", minutes=1),
            _record(
                "art_new",
                "modern-router-warning",
                summary="runtime.router warning in Modern.js config",
                minutes=2,
                tags=["topic:modern-router"],
            ),
        ],
    )

    block, ids = store.baseline_block(task_name="fix modern router warning")

    assert ids[0] == "art_new"
    assert block.index("modern-router-warning") < block.index("old-generic")


@verifies(SWR.SWR_114, SWR.SWR_1526, SWR.SWR_1318)
def test_baseline_block_prioritizes_failed_artifacts_for_diagnostics(tmp_path: Path) -> None:
    store = _store_with_records(
        tmp_path,
        [
            _record("art_ok", "successful-build", summary="build passed", minutes=2),
            _record(
                "art_failed",
                "failed-typecheck",
                summary="typecheck failed with missing import",
                status="failed",
                minutes=1,
            ),
        ],
    )

    _, ids = store.baseline_block(task_name="diagnose failed typecheck")

    assert ids[0] == "art_failed"


@verifies(SWR.SWR_114, SWR.SWR_1527)
def test_full_block_includes_explicit_artifact_body(tmp_path: Path) -> None:
    record = _record("art_plan", "implementation-plan", summary="plan")
    record.body_markdown = "# implementation-plan\n\nfull body"
    store = _store_with_records(tmp_path, [record])

    block, ids = store.full_block(["implementation-plan"])

    assert ids == ["art_plan"]
    assert "PRIOR AGENT CONTEXT (FULL)" in block
    assert "implementation-plan" in block


@verifies(SWR.SWR_114, SWR.SWR_1534)
def test_full_block_elides_oversized_explicit_attachments(tmp_path: Path) -> None:
    first = ArtifactRecord(
        id="art_one",
        slug="plan-one",
        title="Plan One",
        kind="agent_published",
        status="published",
        body_markdown="# Plan One\n\n" + ("A" * 40),
        created_at=dt.datetime(2026, 5, 27, 10, 1, tzinfo=dt.UTC),
    )
    second = ArtifactRecord(
        id="art_two",
        slug="plan-two",
        title="Plan Two",
        kind="agent_published",
        status="published",
        body_markdown="# Plan Two\n\n" + ("B" * 40),
        created_at=dt.datetime(2026, 5, 27, 10, 2, tzinfo=dt.UTC),
    )
    store = _store_with_records(tmp_path, [first, second])

    block, ids = store.full_block(["plan-one", "plan-two"], max_chars=320)

    assert ids == ["art_one"]
    assert "# Plan One" in block
    assert "# Plan Two" not in block
    assert "attached artifact(s) elided" in block
