"""Tests for ``SessionArtifactStore``."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.orchestrator.artifacts import SessionArtifactStore
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.report import (
    ChildDetailPayload,
    ChildReportArtifact,
    HighlightPath,
    SnippetExcerpt,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


def _make_child_record(name: str, task_id: str, persona: str = "librarian") -> ChildTaskRecord:
    rec = ChildTaskRecord(
        name=name,
        canonical_name=name,
        persona=persona,
        task_payload="task body",
        depends_on=[],
        run_in_background=True,
        task_id=task_id,
        state=ChildTaskState.SUCCEEDED,
    )
    return rec


def _make_report(
    status: str = "succeeded",
    summary: str = "Did the thing.",
    key_findings: str = "- finding one\n- finding two",
    snippets: list[SnippetExcerpt] | None = None,
    tags: list[str] | None = None,
) -> ChildReportArtifact:
    detail = ChildDetailPayload(
        highlight_paths=[HighlightPath(path="src/foo.py", reason="entry")],
        snippets=snippets
        or [SnippetExcerpt(path="src/foo.py", content="def foo():\n    return 1", reason="impl")],
    )
    return ChildReportArtifact(
        agent_name="child-1",
        persona="librarian",
        status=status,
        summary=summary,
        key_findings=key_findings,
        detail_payload=detail,
        tags=tags or [],
    )


@verifies(SWR.SWR_1505, SWR.SWR_1517, SWR.SWR_1520)
def test_upsert_creates_artifact_with_snippets(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    rec = _make_child_record("child-1", "task-abc")
    report = _make_report(tags=["ui"])

    artifact = store.upsert_from_child_report(rec, report)

    assert artifact.id.startswith("art_")
    assert artifact.slug == "child-1"
    assert artifact.source_task_id == "task-abc"
    assert artifact.source_persona == "librarian"
    assert artifact.snippets and artifact.snippets[0]["path"] == "src/foo.py"
    assert artifact.tags == ["ui"]
    assert (tmp_path / "artifacts" / f"{artifact.id}.json").exists()
    assert (tmp_path / "artifacts" / f"{artifact.id}.md").exists()
    assert (tmp_path / "artifacts" / "index.json").exists()


@verifies(SWR.SWR_127, SWR.SWR_1520)
def test_upsert_is_idempotent_on_task_id(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    rec = _make_child_record("child-1", "task-abc")
    r1 = store.upsert_from_child_report(rec, _make_report(summary="v1"))
    r2 = store.upsert_from_child_report(rec, _make_report(summary="v2"))

    assert r1.id == r2.id
    assert r2.summary == "v2"
    assert len(store.list()) == 1


@verifies(SWR.SWR_127)
def test_upsert_preserves_consumed_by_metadata(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    rec = _make_child_record("child-1", "task-abc")
    artifact = store.upsert_from_child_report(rec, _make_report(summary="v1"))

    store.mark_consumed(artifact.id, "coding-agent")
    updated = store.upsert_from_child_report(rec, _make_report(summary="v2"))

    assert updated.id == artifact.id
    assert updated.summary == "v2"
    assert updated.consumed_by == ["coding-agent"]


@verifies(SWR.SWR_127)
def test_get_by_id_and_slug(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    rec = _make_child_record("my-child", "t-1")
    artifact = store.upsert_from_child_report(rec, _make_report())

    assert store.get(artifact.id) is artifact
    assert store.get(artifact.slug) is artifact
    assert store.get("nonexistent") is None


@verifies(SWR.SWR_127)
def test_list_filters_by_persona_kind_tags(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    store.upsert_from_child_report(
        _make_child_record("a", "t-a", persona="librarian"),
        _make_report(tags=["ui", "research"]),
    )
    store.upsert_from_child_report(
        _make_child_record("b", "t-b", persona="planner"),
        _make_report(tags=["plan"]),
    )

    assert len(store.list()) == 2
    assert len(store.list(persona="librarian")) == 1
    assert len(store.list(tags=["plan"])) == 1
    assert len(store.list(tags=["ui", "research"])) == 1
    assert len(store.list(tags=["ui", "missing"])) == 0
    assert len(store.list(kind="agent_published")) == 0


@verifies(SWR.SWR_127)
def test_publish_creates_agent_published_artifact(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    body = "# Plan\n\nDo the thing."
    art = store.publish(
        slug="plan-foo",
        title="Plan for Foo",
        body=body,
        persona="planner",
        tags=["plan"],
    )
    assert art.kind == "agent_published"
    assert art.source_persona == "planner"
    assert art.body_markdown == body
    assert store.get("plan-foo") is art
    assert (tmp_path / "artifacts" / f"{art.id}.md").read_text(encoding="utf-8") == body


@verifies(SWR.SWR_127)
def test_update_body_overwrites_markdown_in_place(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    art = store.publish(slug="plan-foo", title="Plan", body="old", persona="planner")

    updated = store.update_body("plan-foo", "# Plan\n\nnew body")

    assert updated.id == art.id
    assert updated.body_markdown == "# Plan\n\nnew body"
    assert updated.edited_at is not None
    assert (tmp_path / "artifacts" / f"{art.id}.md").read_text(encoding="utf-8") == (
        "# Plan\n\nnew body"
    )


@verifies(SWR.SWR_127)
def test_update_body_rejects_unknown_artifact(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)

    with pytest.raises(ValueError, match="Unknown artifact"):
        store.update_body("missing", "body")


@verifies(SWR.SWR_127)
def test_baseline_block_returns_contributing_artifact_ids(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    art = store.publish(slug="plan-foo", title="Plan", body="body", persona="planner")

    block, ids = store.baseline_block()

    assert "PRIOR SIBLING ARTIFACT INDEX" in block
    assert ids == [art.id]


@verifies(SWR.SWR_1526)
def test_baseline_block_is_a_one_line_index_without_findings(tmp_path: Path) -> None:
    """The baseline orients the child; it does not hand it the evidence."""
    store = SessionArtifactStore(tmp_path)
    art = store.publish(
        slug="plan-foo",
        title="Plan",
        body="Add the field, then wire it.\n\nEvidence: src/rotaris_core/deep/module.py:42",
        persona="planner",
    )

    block, _ids = store.baseline_block()

    entries = [line for line in block.splitlines() if line.startswith("- ")]
    assert len(entries) == 1
    entry = entries[0]
    assert entry.startswith(f"- plan-foo [{art.id}] (planner, published): ")
    # Summary only — the second body line stays on disk until artifact_read asks.
    assert "Add the field, then wire it." in entry
    assert "KEY FINDINGS" not in block
    assert "src/rotaris_core/deep/module.py:42" not in block
    assert 'artifact_read("<slug>")' in block


@verifies(SWR.SWR_1526)
def test_baseline_index_entry_truncates_a_long_summary_to_one_line(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    store.publish(
        slug="wordy",
        title="Wordy",
        body="lorem ipsum " * 40,
        persona="librarian",
    )

    block, _ids = store.baseline_block()

    entry = next(line for line in block.splitlines() if line.startswith("- wordy "))
    assert entry.endswith("…")
    assert len(entry) < 260


@verifies(SWR.SWR_1526, SWR.SWR_1527)
def test_index_baseline_does_not_thin_the_attached_full_block(tmp_path: Path) -> None:
    """Slimming the baseline must not cost the explicitly attached artifacts."""
    store = SessionArtifactStore(tmp_path)
    rec = _make_child_record("child-1", "task-abc")
    artifact = store.upsert_from_child_report(rec, _make_report())

    baseline, _ = store.baseline_block()
    full, _ = store.full_block([artifact.id])

    assert "finding one" not in baseline
    assert "KEY FINDINGS" in full
    assert "finding one" in full
    assert "SNIPPETS:" in full


@verifies(SWR.SWR_1526)
def test_baseline_block_elides_over_its_budget(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    for i in range(12):
        store.publish(slug=f"art-{i}", title=f"Art {i}", body=f"Summary {i}", persona="librarian")

    block, ids = store.baseline_block(max_chars=600)

    assert len(ids) < 12
    assert "elided to stay within" in block
    assert "artifact_list()" in block


@verifies(SWR.SWR_127)
def test_publish_supersedes_marks_previous(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    v1 = store.publish(slug="plan-x", title="v1", body="body v1", persona="planner")
    v2 = store.publish(
        slug="plan-x-v2",
        title="v2",
        body="body v2",
        persona="planner",
        supersedes=v1.id,
    )
    v1_after = store.get(v1.id)
    assert v1_after is not None
    assert v1_after.superseded_by == v2.id
    # By default list hides superseded
    visible = store.list()
    assert v2 in visible and v1_after not in visible
    # include_superseded shows both
    assert len(store.list(include_superseded=True)) == 2


@verifies(SWR.SWR_127, SWR.SWR_1518, SWR.SWR_1521)
def test_hydrate_reloads_from_disk(tmp_path: Path) -> None:
    store1 = SessionArtifactStore(tmp_path)
    rec = _make_child_record("c", "t-c")
    art = store1.upsert_from_child_report(rec, _make_report())

    store2 = SessionArtifactStore(tmp_path)
    loaded = store2.hydrate()

    assert loaded == 1
    rehydrated = store2.get(art.id)
    assert rehydrated is not None
    assert rehydrated.summary == art.summary
    assert rehydrated.snippets == art.snippets


@verifies(SWR.SWR_127, SWR.SWR_1521)
def test_hydrate_restores_canonical_name_index(tmp_path: Path) -> None:
    store1 = SessionArtifactStore(tmp_path)
    rec = _make_child_record("c", "")
    art = store1.upsert_from_child_report(rec, _make_report(summary="v1"))

    store2 = SessionArtifactStore(tmp_path)
    assert store2.hydrate() == 1
    updated = store2.upsert_from_child_report(rec, _make_report(summary="v2"))

    assert updated.id == art.id
    assert updated.canonical_name == "c"
    assert updated.summary == "v2"
    assert len(store2.list()) == 1


@verifies(SWR.SWR_127)
def test_supersede_marks_existing_artifacts_by_slug(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    old = store.publish(slug="plan", title="Plan v1", body="v1", persona="planner")
    new = store.publish(slug="plan-v2", title="Plan v2", body="v2", persona="planner")

    store.supersede("plan", "plan-v2")

    old_after = store.get(old.id)
    new_after = store.get(new.id)
    assert old_after is not None
    assert new_after is not None
    assert old_after.superseded_by == new.id
    assert new_after.supersedes == old.id
    assert old_after not in store.list()
    assert new_after in store.list()


@verifies(SWR.SWR_127)
def test_supersede_rejects_unknown_artifacts(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    store.publish(slug="plan", title="Plan", body="v1", persona="planner")

    with pytest.raises(ValueError, match="Unknown superseding artifact"):
        store.supersede("plan", "missing")


@verifies(SWR.SWR_127, SWR.SWR_1518)
def test_in_memory_store_skips_persistence(tmp_path: Path) -> None:
    store = SessionArtifactStore(None)
    rec = _make_child_record("c", "t-c")
    art = store.upsert_from_child_report(rec, _make_report())
    assert store.get(art.id) is art
    # No files anywhere
    assert (
        not any((tmp_path / "artifacts").glob("*")) if (tmp_path / "artifacts").exists() else True
    )


@verifies(SWR.SWR_127, SWR.SWR_1517)
@pytest.mark.parametrize(
    "title,expected_prefix",
    [
        ("My Title!", "my-title"),
        ("  Spaces & punctuation, oh my  ", "spaces-punctuation-oh-my"),
    ],
)
def test_slug_generation_is_safe(tmp_path: Path, title: str, expected_prefix: str) -> None:
    store = SessionArtifactStore(tmp_path)
    art = store.publish(slug=title, title=title, body="x", persona="p")
    assert art.slug.startswith(expected_prefix) or art.slug == expected_prefix


@verifies(SWR.SWR_127)
def test_empty_slug_and_title_fallback(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    art = store.publish(slug="", title="", body="x", persona="p")
    assert art.slug == "artifact"


@verifies(SWR.SWR_127)
def test_unique_slug_disambiguation(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    a = store.publish(slug="plan", title="Plan", body="x", persona="p")
    b = store.publish(slug="plan", title="Plan", body="y", persona="p")
    assert a.slug != b.slug
    assert b.slug.startswith("plan-")


@verifies(SWR.SWR_1533)
def test_artifact_and_index_writes_are_atomic(tmp_path: Path, monkeypatch: Any) -> None:
    """Productive use: a crash mid-publish never leaves a half-written artifact behind.
    Expected outcome: every JSON/Markdown/index write goes through `atomic_write`."""
    import rotaris_core.orchestrator.artifacts as artifacts_module

    written: list[str] = []
    real_atomic_write = artifacts_module.atomic_write

    def _tracking_atomic_write(path: Path, content: str) -> None:
        written.append(path.name)
        real_atomic_write(path, content)

    monkeypatch.setattr(artifacts_module, "atomic_write", _tracking_atomic_write)

    store = SessionArtifactStore(tmp_path)
    artifact = store.upsert_from_child_report(
        _make_child_record("child-1", "task-abc"), _make_report()
    )

    assert {f"{artifact.id}.json", f"{artifact.id}.md", "index.json"} <= set(written)
    assert list((tmp_path / "artifacts").glob("*.tmp")) == []
    assert list((tmp_path / "artifacts").glob("tmp*")) == []
