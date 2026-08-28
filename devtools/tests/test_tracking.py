"""The generated block in the tracking PR body."""

from __future__ import annotations

from conftest import MANIFEST, write_manifest
from milestone_lib.gate import Check, GateResult
from milestone_lib.manifest import parse_milestones
from milestone_lib.progress import progress_for
from milestone_lib.tracking import END_MARKER, START_MARKER, status_block, tracking_pr_body

RED = GateResult("M1", (Check("members approved", False, "4 not approved"),))
GREEN = GateResult("M1", (Check("members approved", True, "all approved"),))


def _progress(tmp_path, store):
    write_manifest(tmp_path, "M1-first.md", MANIFEST)
    milestone = parse_milestones(tmp_path).milestones[0]
    return progress_for(milestone, tmp_path, store, {})


def test_the_block_is_delimited(tmp_path, store):
    block = status_block(_progress(tmp_path, store), RED)
    assert block.startswith(START_MARKER)
    assert block.rstrip().endswith(END_MARKER)


def test_the_block_carries_the_headline_numbers(tmp_path, store):
    block = status_block(_progress(tmp_path, store), RED)
    assert "0/4 requirements approved (0%)" in block
    assert "target `v0.121.0`" in block
    assert "branch `milestone/m1-first`" in block


def test_blockers_are_listed_when_the_gate_is_red(tmp_path, store):
    block = status_block(_progress(tmp_path, store), RED)
    assert "members approved: 4 not approved" in block


def test_a_green_gate_lists_no_blockers(tmp_path, store):
    block = status_block(_progress(tmp_path, store), GREEN)
    assert "ready to merge" in block
    assert "blocked on" not in block


def test_trace_columns_are_na_where_the_requirement_does_not_require_them(tmp_path, store):
    """SWR-100 is an epic index: trace and test optional, so not a red mark."""
    block = status_block(_progress(tmp_path, store), RED)
    epic_row = next(line for line in block.splitlines() if "SWR-100]" in line)
    assert epic_row.endswith("| n/a | n/a |")


def test_a_fresh_body_gets_an_intro(tmp_path, store):
    body = tracking_pr_body(_progress(tmp_path, store), RED)
    assert body.startswith("Integration branch for **M1 — First**.")
    assert START_MARKER in body


def test_prose_above_the_marker_survives_a_refresh(tmp_path, store):
    progress = _progress(tmp_path, store)
    first = tracking_pr_body(progress, RED)
    edited = first.replace("Integration branch", "A human wrote this.\n\nIntegration branch", 1)
    refreshed = tracking_pr_body(progress, GREEN, edited)
    assert "A human wrote this." in refreshed
    assert refreshed.count(START_MARKER) == 1
    assert "ready to merge" in refreshed


def test_an_unmarked_existing_body_is_kept_above_the_new_block(tmp_path, store):
    refreshed = tracking_pr_body(_progress(tmp_path, store), RED, "Some earlier description.")
    assert refreshed.startswith("Some earlier description.")
    assert START_MARKER in refreshed
