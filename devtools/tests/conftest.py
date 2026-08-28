"""Shared fixtures for the milestone tool's tests.

These tests run under the project venv (``uv run pytest devtools/tests -q``), so
they may import product modules the tool itself avoids at runtime — which is how
``test_membership.py`` pins the tool's reimplemented layout rule against the
product's own.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

DEVTOOLS = Path(__file__).resolve().parent.parent
if str(DEVTOOLS) not in sys.path:
    sys.path.insert(0, str(DEVTOOLS))

from rotaris_core.reqtocode.declarations import ReqMeta, ReqStatus  # noqa: E402

REPO_ROOT = DEVTOOLS.parent


@pytest.fixture
def repo_root() -> Path:
    """The real repository, for the tests that assert against live data."""
    return REPO_ROOT


def make_req(
    number: int,
    *,
    source_path: str,
    status: ReqStatus = ReqStatus.DRAFT,
    title: str = "",
    trace_required: bool = True,
    test_required: bool = True,
    req_type: str = "product",
) -> ReqMeta:
    """A requirement with only the fields these tests care about spelled out."""
    return ReqMeta(
        req_id=f"SWR-{number}",
        number=number,
        status=status,
        title=title or f"Requirement {number}",
        source_path=source_path,
        trace_required=trace_required,
        test_required=test_required,
        content_hash=f"{number:016x}",
        req_type=req_type,
    )


@pytest.fixture
def store() -> dict[int, ReqMeta]:
    """A small synthetic requirement store.

    Epic 100 owns 100-103 by file location. SWR-900 is an overflow id that sits
    in epic 100's folder despite its number, and SWR-101 is deprecated — both
    are the cases the number-range shortcut would get wrong.
    """
    return {
        meta.number: meta
        for meta in (
            make_req(
                100,
                source_path="docs/requirements/100-alpha.md",
                trace_required=False,
                test_required=False,
            ),
            make_req(
                101,
                source_path="docs/requirements/100-alpha/SWR-101-one.md",
                status=ReqStatus.DEPRECATED,
            ),
            make_req(102, source_path="docs/requirements/100-alpha/SWR-102-two.md"),
            make_req(103, source_path="docs/requirements/100-alpha/SWR-103-three.md"),
            make_req(900, source_path="docs/requirements/100-alpha/SWR-900-overflow.md"),
            make_req(
                200,
                source_path="docs/requirements/200-beta.md",
                trace_required=False,
                test_required=False,
            ),
            make_req(201, source_path="docs/requirements/200-beta/SWR-201-one.md"),
        )
    }


def write_manifest(directory: Path, name: str, body: str) -> Path:
    """Write one manifest into a temp ``docs/milestones/`` tree."""
    target = directory / "docs" / "milestones"
    target.mkdir(parents=True, exist_ok=True)
    path = target / name
    path.write_text(body, encoding="utf-8")
    return path


MANIFEST = """---
milestone: M1
title: "First"
status: active
branch: milestone/m1-first
target-version: "0.121.0"
opened: 2026-08-25
epics: [SWR-100]
requirements: [SWR-201]
excludes: [SWR-103]
---

# M1 — First
"""
