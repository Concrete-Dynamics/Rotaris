"""Where each transcript row sits, and what it costs to find out (SWR-2452).

A transcript is a stack of rows of different heights that grows at the bottom
while the reader is looking at it. Two questions have to be cheap: *where does
row `n` start* (asked once per visible row, on every paint) and *which row is at
pixel `y`* (asked on every click, hover and scroll). A third has to be cheap in
a different way: *a row changed — what moved?* Streaming asks that several times
a second, and the honest answer is almost always "the last row and everything
after it", which is nothing.

So: heights in a list, running totals beside them, and a watermark saying how
far the totals are still true. Appending is two appends. Changing row *r* lowers
the watermark to *r* and touches nothing else; the totals past it are rebuilt
the next time somebody asks for one, which is the next paint at the latest and
often never, because the rows below a change are usually off screen.

The alternative is a Fenwick tree, which would make a change to row 0 of a long
transcript `O(log n)` instead of `O(n)`. It is not worth it: that `O(n)` is a
few thousand integer additions on a user-initiated expand, while the operation
this file exists for — the append — is already `O(1)`. If a profile ever
disagrees, the internals can be replaced without any caller noticing, which is
why they are behind these seven methods rather than open-coded in the view.
"""

from __future__ import annotations

from bisect import bisect_right

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_2452)
class RowGeometry:
    """Row heights and their running totals, with a dirty suffix."""

    __slots__ = ("_heights", "_offsets", "_valid_upto")

    def __init__(self) -> None:
        self._heights: list[int] = []
        #: ``_offsets[i]`` is the top of row *i*; ``_offsets[len]`` is the total
        #: height. One longer than ``_heights``, always.
        self._offsets: list[int] = [0]
        #: ``_offsets`` is true for indices ``<= _valid_upto``. Everything past
        #: it is stale and gets rebuilt on demand.
        self._valid_upto: int = 0

    def __len__(self) -> int:
        return len(self._heights)

    # ── writing ──────────────────────────────────────────────────────────

    @traces(SWR.SWR_2452)
    def reset(self, heights: list[int]) -> None:
        """Replace every row. The only operation that is `O(n)` by nature."""
        self._heights = list(heights)
        self._offsets = [0]
        self._valid_upto = 0

    @traces(SWR.SWR_2452)
    def insert(self, row: int, heights: list[int]) -> None:
        """Insert rows before *row*. Appending — ``row == len(self)`` — is `O(1)`."""
        if not heights:
            return
        if row == len(self._heights):
            # The append. Extend the totals in step so the watermark never moves
            # backwards, which is what keeps streaming free.
            self._materialize(len(self._heights))
            self._heights.extend(heights)
            running = self._offsets[-1]
            for height in heights:
                running += height
                self._offsets.append(running)
            self._valid_upto = len(self._heights)
            return
        self._heights[row:row] = heights
        self._invalidate_from(row)

    @traces(SWR.SWR_2452)
    def remove(self, row: int, count: int) -> None:
        """Drop *count* rows starting at *row*."""
        if count <= 0:
            return
        del self._heights[row : row + count]
        self._invalidate_from(row)

    @traces(SWR.SWR_2452)
    def set_height(self, row: int, height: int) -> bool:
        """Record a new height for *row*; True when it actually moved anything."""
        if not 0 <= row < len(self._heights) or self._heights[row] == height:
            return False
        self._heights[row] = height
        self._invalidate_from(row)
        return True

    def _invalidate_from(self, row: int) -> None:
        self._valid_upto = min(self._valid_upto, row)
        del self._offsets[row + 1 :]

    def _materialize(self, upto: int) -> None:
        """Make ``_offsets`` true through row *upto* (inclusive of its top)."""
        if upto <= self._valid_upto:
            return
        upto = min(upto, len(self._heights))
        running = self._offsets[self._valid_upto]
        for row in range(self._valid_upto, upto):
            running += self._heights[row]
            self._offsets.append(running)
        self._valid_upto = upto

    # ── reading ──────────────────────────────────────────────────────────

    @traces(SWR.SWR_2452)
    def height(self, row: int) -> int:
        """The measured height of *row*, or 0 if there is no such row."""
        if not 0 <= row < len(self._heights):
            return 0
        return self._heights[row]

    @traces(SWR.SWR_2452)
    def top(self, row: int) -> int:
        """The y of *row*'s top edge in content coordinates."""
        if row <= 0:
            return 0
        row = min(row, len(self._heights))
        self._materialize(row)
        return self._offsets[row]

    @traces(SWR.SWR_2452)
    def total(self) -> int:
        """The height of the whole transcript."""
        self._materialize(len(self._heights))
        return self._offsets[-1]

    @traces(SWR.SWR_2452)
    def row_at(self, y: int) -> int:
        """The row containing content-y *y*, or -1 when *y* falls outside.

        A click below the last row belongs to no row, which is what the view
        wants: it is how "clicked the empty space under the transcript" stays
        distinguishable from "clicked the last message".
        """
        if y < 0 or not self._heights:
            return -1
        if y >= self.total():
            return -1
        # `total()` has just materialized everything, so the search is exact.
        return bisect_right(self._offsets, y) - 1

    @traces(SWR.SWR_2452)
    def visible_span(self, top: int, bottom: int) -> tuple[int, int]:
        """The half-open row range intersecting content rows *top*..*bottom*.

        Returns ``(0, 0)`` when nothing intersects, so a caller can always write
        ``for row in range(*geometry.visible_span(...))``.
        """
        if not self._heights or bottom <= top:
            return (0, 0)
        total = self.total()
        if top >= total or bottom <= 0:
            return (0, 0)
        first = max(0, bisect_right(self._offsets, max(0, top)) - 1)
        last = bisect_right(self._offsets, min(bottom, total) - 1)
        return (first, min(last, len(self._heights)))
