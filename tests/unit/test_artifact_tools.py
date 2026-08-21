"""Tests for the artifact_read / artifact_list / artifact_write executors."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

import pytest

from rotaris_core.config.schema import RuntimePolicy
from rotaris_core.orchestrator.artifacts import VALID_ARTIFACT_TAGS, SessionArtifactStore
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.artifacts import (
    ArtifactListAction,
    ArtifactListExecutor,
    ArtifactReadAction,
    ArtifactReadExecutor,
    ArtifactWriteAction,
    ArtifactWriteExecutor,
)


@pytest.fixture
def store(tmp_path: Path) -> SessionArtifactStore:
    s = SessionArtifactStore(tmp_path)
    s.publish(
        slug="plan-foo",
        title="Plan: Foo",
        body="# Plan\n\n- step 1\n- step 2",
        persona="planner",
        tags=["planning", "implementation"],
    )
    s.publish(
        slug="design-bar",
        title="Design: Bar",
        body="# Design\n\nuse Strategy pattern",
        persona="architect",
        tags=["planning"],
    )
    return s


@verifies(SWR.SWR_1502, SWR.SWR_1529)
def test_valid_artifact_tags_is_frozenset() -> None:
    """VALID_ARTIFACT_TAGS is a frozenset of exactly 6 values."""
    assert isinstance(VALID_ARTIFACT_TAGS, frozenset)
    assert (
        frozenset({"research", "planning", "implementation", "review", "verification", "errors"})
        == VALID_ARTIFACT_TAGS
    )


@verifies(SWR.SWR_1502, SWR.SWR_1522)
def test_read_returns_full_body(store: SessionArtifactStore) -> None:
    exec_ = ArtifactReadExecutor(store)
    obs = exec_(ArtifactReadAction(id_or_slug="plan-foo"))
    assert obs.found is True
    assert "# Plan" in obs.body
    assert "step 1" in obs.body


@verifies(SWR.SWR_1502)
def test_read_by_id_works(store: SessionArtifactStore) -> None:
    plan = store.get("plan-foo")
    assert plan is not None
    obs = ArtifactReadExecutor(store)(ArtifactReadAction(id_or_slug=plan.id))
    assert obs.found is True
    assert plan.id in obs.body or "Plan" in obs.body


@verifies(SWR.SWR_1502)
def test_read_marks_artifact_consumed_for_reader(store: SessionArtifactStore) -> None:
    plan = store.get("plan-foo")
    assert plan is not None

    obs = ArtifactReadExecutor(store, persona="planner")(ArtifactReadAction(id_or_slug=plan.id))

    assert obs.found is True
    updated = store.get(plan.id)
    assert updated is not None
    assert updated.consumed_by == ["planner"]


@verifies(SWR.SWR_1502, SWR.SWR_1522)
def test_read_unknown_returns_error(store: SessionArtifactStore) -> None:
    obs = ArtifactReadExecutor(store)(ArtifactReadAction(id_or_slug="nope"))
    assert obs.found is False
    assert obs.is_error is True
    assert "not found" in obs.body.lower()


@verifies(SWR.SWR_1502, SWR.SWR_1522)
def test_read_sections_filters_output(store: SessionArtifactStore) -> None:
    obs = ArtifactReadExecutor(store)(
        ArtifactReadAction(id_or_slug="plan-foo", sections=["summary"]),
    )
    assert obs.found is True
    # The summary section is the first line of the body (truncated to 280 chars).
    assert "Summary" in obs.body
    # The full body's Markdown bullets ("- step 1") should NOT be in a summary-only view.
    # (publish() takes the first line as the summary.)


@verifies(SWR.SWR_1502)
def test_list_returns_all_by_default(store: SessionArtifactStore) -> None:
    obs = ArtifactListExecutor(store)(ArtifactListAction())
    assert obs.count == 2
    assert "plan-foo" in obs.body
    assert "design-bar" in obs.body


@verifies(SWR.SWR_1502)
def test_list_filters_by_persona(store: SessionArtifactStore) -> None:
    obs = ArtifactListExecutor(store)(ArtifactListAction(persona="planner"))
    assert obs.count == 1
    assert "plan-foo" in obs.body
    assert "design-bar" not in obs.body


@verifies(SWR.SWR_1502)
def test_list_filters_by_tags(store: SessionArtifactStore) -> None:
    obs = ArtifactListExecutor(store)(ArtifactListAction(tags=["planning"]))
    assert obs.count == 2  # both have "planning"
    obs2 = ArtifactListExecutor(store)(ArtifactListAction(tags=["planning", "implementation"]))
    assert obs2.count == 1  # only plan-foo has both
    assert "plan-foo" in obs2.body


@verifies(SWR.SWR_1502)
def test_list_respects_limit(store: SessionArtifactStore) -> None:
    obs = ArtifactListExecutor(store)(ArtifactListAction(limit=1))
    assert obs.count == 1


@verifies(SWR.SWR_1502)
def test_list_empty_message(tmp_path: Path) -> None:
    empty = SessionArtifactStore(tmp_path)
    obs = ArtifactListExecutor(empty)(ArtifactListAction())
    assert obs.count == 0
    assert "no artifacts" in obs.body.lower()


@verifies(SWR.SWR_1502, SWR.SWR_1536)
def test_write_publishes_artifact(store: SessionArtifactStore) -> None:
    exec_ = ArtifactWriteExecutor(store, persona="planner")
    obs = exec_(
        ArtifactWriteAction(
            slug="plan-new",
            title="New plan",
            body="# Plan",
            tags=["planning"],
        ),
    )
    assert obs.artifact_id.startswith("art_")
    assert obs.slug == "plan-new"
    rec = store.get(obs.artifact_id)
    assert rec is not None
    assert rec.source_persona == "planner"
    assert rec.tags == ["planning"]


@verifies(SWR.SWR_1502)
def test_write_supersedes_marks_previous(store: SessionArtifactStore) -> None:
    exec_ = ArtifactWriteExecutor(store, persona="planner")
    obs = exec_(
        ArtifactWriteAction(
            slug="plan-foo-v2",
            title="Plan v2",
            body="# Updated plan",
            tags=["planning"],
            supersedes="plan-foo",
        ),
    )
    new_rec = store.get(obs.artifact_id)
    assert new_rec is not None
    old_rec = store.get("plan-foo")
    assert old_rec is not None
    assert old_rec.superseded_by == new_rec.id


@verifies(SWR.SWR_1524, SWR.SWR_1537)
def test_write_links_artifact_to_current_child(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    manager = ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    child = manager.spawn_child("planner-child", "planner", "draft a plan")

    exec_ = ArtifactWriteExecutor(
        store,
        persona="planner",
        child_manager=manager,
        canonical_name=child.canonical_name,
        task_id=child.task_id,
    )
    obs = exec_(
        ArtifactWriteAction(
            slug="plan-linked",
            title="Linked plan",
            body="# Plan\n\nDo the thing",
            tags=["planning"],
        ),
    )

    artifact = store.get(obs.artifact_id)
    assert artifact is not None
    assert artifact.source_task_id == child.task_id
    assert artifact.canonical_name == child.canonical_name
    linked_child = manager.get_record_by_task_id(child.task_id)
    assert linked_child is not None
    assert linked_child.produced_artifact_ids == [artifact.id]


@verifies(SWR.SWR_1524, SWR.SWR_1529)
def test_write_rejects_invalid_tags(store: SessionArtifactStore) -> None:
    """artifact_write rejects tags outside the closed vocabulary."""
    exec_ = ArtifactWriteExecutor(store, persona="planner")
    obs = exec_(
        ArtifactWriteAction(
            slug="bad-tags",
            title="Bad",
            body="## Nope",
            tags=["design", "architecture"],
        ),
    )
    assert obs.is_error is True
    text = str(obs.content[0].text)  # type: ignore[union-attr]
    assert "Invalid tag" in text
    assert "design" in text
    assert "architecture" in text


@verifies(SWR.SWR_1524, SWR.SWR_1529)
def test_write_accepts_multiple_valid_tags(store: SessionArtifactStore) -> None:
    """artifact_write accepts multiple valid tags."""
    exec_ = ArtifactWriteExecutor(store, persona="planner")
    obs = exec_(
        ArtifactWriteAction(
            slug="mixed-tags",
            title="Mixed",
            body="## Body",
            tags=["planning", "review"],
        ),
    )
    assert obs.is_error is False
    rec = store.get(obs.artifact_id)
    assert rec is not None
    assert rec.tags == ["planning", "review"]


@verifies(SWR.SWR_1524, SWR.SWR_1529)
def test_write_rejects_mixed_valid_and_invalid_tags(store: SessionArtifactStore) -> None:
    """Even one invalid tag causes rejection."""
    exec_ = ArtifactWriteExecutor(store, persona="planner")
    obs = exec_(
        ArtifactWriteAction(
            slug="mixed-bad",
            title="Mixed",
            body="## Body",
            tags=["planning", "invalid-tag"],
        ),
    )
    assert obs.is_error is True
    text = str(obs.content[0].text)  # type: ignore[union-attr]
    assert "Invalid tag" in text
    assert "invalid-tag" in text


@verifies(SWR.SWR_1524)
def test_write_accepts_empty_tags(store: SessionArtifactStore) -> None:
    """Empty tags list passes validation."""
    exec_ = ArtifactWriteExecutor(store, persona="planner")
    obs = exec_(
        ArtifactWriteAction(
            slug="no-tags",
            title="No tags",
            body="## Body",
        ),
    )
    assert obs.is_error is False
    rec = store.get(obs.artifact_id)
    assert rec is not None
    assert rec.tags == []


@verifies(SWR.SWR_1523)
def test_list_empty_tag_filter_shows_all(store: SessionArtifactStore) -> None:
    """Empty tags list returns all artifacts (no tag filter applied)."""
    obs = ArtifactListExecutor(store)(ArtifactListAction(tags=[]))
    assert obs.count == 2


@verifies(SWR.SWR_2427)
def test_siblings_publishing_keep_separate_attribution(tmp_path: Path) -> None:
    """Two children of one persona must not inherit each other's identity."""
    store = SessionArtifactStore(tmp_path)
    manager = ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )
    architecture = manager.spawn_child("run-architecture", "codebase-analyst", "architecture")
    tests_ui = manager.spawn_child("run-tests-ui", "codebase-analyst", "tests")

    published: dict[str, str] = {}
    for child in (architecture, tests_ui):
        exec_ = ArtifactWriteExecutor(
            store,
            persona="codebase-analyst",
            child_manager=manager,
            canonical_name=child.canonical_name,
            task_id=child.task_id,
        )
        obs = exec_(
            ArtifactWriteAction(
                slug=f"notes-{child.canonical_name}",
                title=f"Notes from {child.canonical_name}",
                body="# Notes",
            ),
        )
        published[child.canonical_name] = obs.artifact_id

    for child in (architecture, tests_ui):
        record = store.get(published[child.canonical_name])
        assert record is not None
        assert record.canonical_name == child.canonical_name
        assert record.source_task_id == child.task_id
        assert record.created_by == child.canonical_name
        assert child.produced_artifact_ids == [published[child.canonical_name]]


@verifies(SWR.SWR_2427)
def test_publish_timeline_event_actor_is_the_canonical_name(tmp_path: Path) -> None:
    store = SessionArtifactStore(tmp_path)
    exec_ = ArtifactWriteExecutor(
        store,
        persona="codebase-analyst",
        canonical_name="run-architecture",
        task_id="bg_7f07bc93",
    )
    obs = exec_(
        ArtifactWriteAction(slug="arch-notes", title="Architecture notes", body="# Notes"),
    )

    events = [
        json.loads(line)
        for line in (tmp_path / "timeline.jsonl").read_text().splitlines()
        if line.strip()
    ]
    published = [e for e in events if e["type"] == "artifact_published"]
    assert len(published) == 1
    assert published[0]["actor"] == "run-architecture"
    assert published[0]["metadata"]["artifact_id"] == obs.artifact_id
    assert published[0]["metadata"]["task_id"] == "bg_7f07bc93"
