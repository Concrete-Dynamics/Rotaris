"""`RowGeometry` — the transcript's row index (SWR-2452).

No Qt here. The geometry is the part that has to be exactly right, and it is
plain arithmetic, so it is tested as plain arithmetic: fast, deterministic, and
free of anything that needs a display.
"""

from __future__ import annotations

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.views.transcript_geometry import RowGeometry

pytestmark = pytest.mark.unit


def _geometry(*heights: int) -> RowGeometry:
    geometry = RowGeometry()
    geometry.insert(0, list(heights))
    return geometry


def _tops(geometry: RowGeometry) -> list[int]:
    return [geometry.top(row) for row in range(len(geometry))]


@verifies(SWR.SWR_2452)
def test_an_empty_geometry_has_no_rows_and_no_height() -> None:
    geometry = RowGeometry()

    assert len(geometry) == 0
    assert geometry.total() == 0
    assert geometry.top(0) == 0
    assert geometry.row_at(0) == -1
    assert geometry.visible_span(0, 500) == (0, 0)


@verifies(SWR.SWR_2452)
def test_rows_stack_in_order_and_sum_to_the_total() -> None:
    geometry = _geometry(30, 40, 50)

    assert _tops(geometry) == [0, 30, 70]
    assert geometry.total() == 120
    assert [geometry.height(row) for row in range(3)] == [30, 40, 50]


@verifies(SWR.SWR_2452)
def test_appending_leaves_the_rows_before_it_where_they_were() -> None:
    """The streaming case: a new row must not move a single row above it."""
    geometry = _geometry(30, 40, 50)
    before = _tops(geometry)

    geometry.insert(len(geometry), [60])

    assert _tops(geometry)[:3] == before
    assert geometry.top(3) == 120
    assert geometry.total() == 180


@verifies(SWR.SWR_2452)
def test_inserting_in_the_middle_shifts_everything_below_it() -> None:
    geometry = _geometry(30, 40, 50)

    geometry.insert(1, [10, 20])

    assert _tops(geometry) == [0, 30, 40, 60, 100]
    assert geometry.total() == 150


@verifies(SWR.SWR_2452)
def test_removing_rows_closes_the_gap() -> None:
    geometry = _geometry(30, 40, 50, 60)

    geometry.remove(1, 2)

    assert _tops(geometry) == [0, 30]
    assert geometry.total() == 90


@verifies(SWR.SWR_2452)
def test_changing_a_height_moves_only_the_rows_after_it() -> None:
    geometry = _geometry(30, 40, 50)

    assert geometry.set_height(1, 100) is True

    assert _tops(geometry) == [0, 30, 130]
    assert geometry.total() == 180


@verifies(SWR.SWR_2452)
def test_setting_the_height_a_row_already_has_changes_nothing() -> None:
    """The view leans on this to skip a relayout it does not owe."""
    geometry = _geometry(30, 40, 50)

    assert geometry.set_height(1, 40) is False
    assert geometry.set_height(9, 40) is False
    assert geometry.total() == 120


@verifies(SWR.SWR_2452)
def test_reset_replaces_every_row() -> None:
    geometry = _geometry(30, 40, 50)

    geometry.reset([10, 10])

    assert _tops(geometry) == [0, 10]
    assert geometry.total() == 20


@verifies(SWR.SWR_2452)
def test_row_at_resolves_a_pixel_to_the_row_that_contains_it() -> None:
    geometry = _geometry(30, 40, 50)

    assert geometry.row_at(0) == 0
    assert geometry.row_at(29) == 0
    assert geometry.row_at(30) == 1  # first pixel of the next row
    assert geometry.row_at(69) == 1
    assert geometry.row_at(70) == 2
    assert geometry.row_at(119) == 2


@verifies(SWR.SWR_2452)
def test_a_pixel_outside_the_transcript_belongs_to_no_row() -> None:
    """Clicking the empty space under the last message is not clicking it."""
    geometry = _geometry(30, 40, 50)

    assert geometry.row_at(-1) == -1
    assert geometry.row_at(120) == -1
    assert geometry.row_at(10_000) == -1


@verifies(SWR.SWR_2452)
def test_visible_span_covers_every_row_the_viewport_touches() -> None:
    geometry = _geometry(30, 40, 50, 60)  # tops 0, 30, 70, 120; total 180

    assert geometry.visible_span(0, 30) == (0, 1)
    assert geometry.visible_span(0, 31) == (0, 2)
    assert geometry.visible_span(35, 75) == (1, 3)
    assert geometry.visible_span(119, 121) == (2, 4)
    assert geometry.visible_span(0, 180) == (0, 4)


@verifies(SWR.SWR_2452)
def test_visible_span_off_either_end_is_empty() -> None:
    geometry = _geometry(30, 40, 50)

    assert geometry.visible_span(120, 300) == (0, 0)
    assert geometry.visible_span(-300, 0) == (0, 0)
    assert geometry.visible_span(50, 50) == (0, 0)


@verifies(SWR.SWR_2452)
def test_a_dirty_suffix_is_rebuilt_correctly_however_it_is_asked_for() -> None:
    """The watermark is an optimisation, so no reader may be able to see it.

    Each branch below dirties the same geometry and then asks a different
    question first — `top`, `total`, `row_at`, `visible_span` — and all four have
    to give the answer a freshly built geometry would.
    """
    heights = [30, 40, 50, 60, 70]
    expected = _geometry(*heights)
    expected.set_height(1, 15)

    for question in (
        lambda g: g.top(4),
        lambda g: g.total(),
        lambda g: g.row_at(100),
        lambda g: g.visible_span(0, 400),
        lambda g: g.top(2),
    ):
        geometry = _geometry(*heights)
        geometry.set_height(1, 15)
        question(geometry)

        assert _tops(geometry) == _tops(expected)
        assert geometry.total() == expected.total()


@verifies(SWR.SWR_2452)
def test_interleaved_edits_stay_consistent_with_a_rebuilt_geometry() -> None:
    """A long session is edits in any order; the index may not drift from them."""
    heights = [20, 30, 40, 50, 60, 70, 80]
    geometry = _geometry(*heights)

    geometry.insert(len(geometry), [90])
    heights.append(90)
    geometry.set_height(0, 25)
    heights[0] = 25
    geometry.insert(3, [35])
    heights.insert(3, 35)
    geometry.remove(1, 2)
    del heights[1:3]
    geometry.set_height(len(geometry) - 1, 15)
    heights[-1] = 15
    geometry.insert(len(geometry), [45, 55])
    heights.extend([45, 55])

    assert _tops(geometry) == _tops(_geometry(*heights))
    assert geometry.total() == sum(heights)


@verifies(SWR.SWR_2452)
def test_a_zero_height_row_still_resolves_its_neighbours() -> None:
    """Nothing forbids a zero-height row; it must not swallow the row after it."""
    geometry = _geometry(30, 0, 50)

    assert _tops(geometry) == [0, 30, 30]
    assert geometry.row_at(30) == 2
    assert geometry.total() == 80
