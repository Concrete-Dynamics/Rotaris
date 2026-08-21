"""Productive use: a user opens a project that keeps its requirements under
``docs/requirements/`` in a convention Rotaris' own parser cannot read — a different
frontmatter key, a different id shape — and expects to be offered a way to read them
rather than told the project declares none.
Expected outcome: the built-in source claims a workspace by producing requirements and
not by matching a directory, so a store it cannot read is handed on to discovery, a
store that is genuinely empty is still claimed and still reports an empty board, and no
workspace whose store the parser *can* read changes hands."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.generator import probe_requirement_store
from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

if TYPE_CHECKING:
    from pathlib import Path

OURS = """---
req-id: SWR-4301
status: approved
trace: optional
test: optional
title: "A widget renders"
---

# SWR-4301 — A widget renders

The widget renders.
"""

FOREIGN = """---
id: SWR-FR-TRK-001
title: Punch In
status: approved
priority: must
---

# SWR-FR-TRK-001 — Punch In

A user shall be able to start a time-tracking session.
"""

PROSE = """# Conventions

How this project writes requirements. No frontmatter, so no parser claims it.
"""


def _store(root: Path, **documents: str) -> Path:
    store = root / "docs" / "requirements"
    store.mkdir(parents=True, exist_ok=True)
    for name, text in documents.items():
        (store / f"{name}.md").write_text(text, encoding="utf-8")
    return root


@verifies(SWR.SWR_3120)
def test_a_store_with_our_convention_is_claimed(tmp_path: Path) -> None:
    """The unchanged case: a `req-id` anywhere and this is our store."""
    root = _store(tmp_path, README=PROSE, SWR_4301=OURS)

    probe = probe_requirement_store(root)

    assert probe.declares_requirements is True
    assert reqtocode_source_for(root) is not None


@verifies(SWR.SWR_3120)
def test_a_foreign_store_under_our_path_is_not_claimed(tmp_path: Path) -> None:
    """The defect: the directory is ours, the documents are not.

    Claiming this produced a bound source that read nothing, an empty board, and
    the sentence "the requirement store is readable but declares no requirement"
    — while sixty-two requirements sat in the tree. Standing aside is what lets
    discovery see the workspace at all (SWR-3106).
    """
    root = _store(tmp_path, CONVENTIONS=PROSE, punch_in=FOREIGN)

    probe = probe_requirement_store(root)

    assert probe.declares_requirements is False
    assert probe.frontmatter_documents == 1
    assert reqtocode_source_for(root) is None


@verifies(SWR.SWR_3120)
def test_an_empty_store_is_still_ours(tmp_path: Path) -> None:
    """A project with our layout and no requirements yet keeps its source.

    "This project declares no requirement" and "this project declares them in a
    way we cannot read" are different facts, and only the first is an empty
    board. A store holding nothing but prose is the first.
    """
    root = _store(tmp_path, README=PROSE)

    probe = probe_requirement_store(root)

    assert probe.declares_requirements is False
    assert probe.frontmatter_documents == 0
    assert reqtocode_source_for(root) is not None
    assert reqtocode_source_for(root).read().requirements == ()


@verifies(SWR.SWR_3120)
def test_a_store_directory_that_does_not_exist_is_not_claimed(tmp_path: Path) -> None:
    """Unchanged: an absent store is a project that keeps requirements elsewhere."""
    probe = probe_requirement_store(tmp_path)

    assert probe.declares_requirements is False
    assert probe.scanned == 0
    assert reqtocode_source_for(tmp_path) is None


@verifies(SWR.SWR_3120)
def test_the_probe_stops_at_the_first_requirement_it_finds(tmp_path: Path) -> None:
    """Selection runs on every board refresh, so it must not parse the store.

    A repository with fifteen hundred requirements answers this question from
    the first document in sorted order, and the count is what proves it rather
    than a timing.
    """
    root = _store(
        tmp_path,
        aaa_first=OURS,
        bbb_second=OURS.replace("SWR-4301", "SWR-4302"),
        ccc_third=OURS.replace("SWR-4301", "SWR-4303"),
    )

    probe = probe_requirement_store(root)

    assert probe.declares_requirements is True
    assert probe.scanned == 1


@verifies(SWR.SWR_3120)
def test_a_foreign_store_is_scanned_to_the_end_before_being_refused(tmp_path: Path) -> None:
    """Refusing costs a full scan, and only a workspace we cannot read pays it."""
    root = _store(tmp_path, one=FOREIGN, two=FOREIGN.replace("TRK-001", "TRK-002"), notes=PROSE)

    probe = probe_requirement_store(root)

    assert probe.scanned == 3
    assert probe.frontmatter_documents == 2
    assert probe.declares_requirements is False
