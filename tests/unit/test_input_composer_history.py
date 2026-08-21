"""Unit tests for PromptHistory (prompt input history cycling)."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.prompt_history import PromptHistory

if TYPE_CHECKING:
    from pathlib import Path

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _history_with(*items: str, capacity: int = 50) -> PromptHistory:
    h = PromptHistory(capacity=capacity)
    for item in items:
        h.append(item)
    return h


def _persistent_history(path: Path, *, capacity: int = 50) -> PromptHistory:
    return PromptHistory(capacity=capacity, path=path)


# ---------------------------------------------------------------------------
# Basic append / state
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1203)
class TestAppend:
    @verifies(SWR.SWR_1153)
    def test_empty_initially(self) -> None:
        h = PromptHistory()
        assert h.entries == []
        assert h.cursor == 0
        assert h.at_unsent

    @verifies(SWR.SWR_1153, SWR.SWR_1156)
    def test_append_records_entry(self) -> None:
        h = PromptHistory()
        h.append("hello")
        assert h.entries == ["hello"]

    @verifies(SWR.SWR_1153, SWR.SWR_1156)
    def test_cursor_at_unsent_after_append(self) -> None:
        h = PromptHistory()
        h.append("hello")
        assert h.cursor == 1
        assert h.at_unsent

    @verifies(SWR.SWR_1153, SWR.SWR_1158)
    def test_blank_text_not_recorded(self) -> None:
        h = PromptHistory()
        h.append("")
        h.append("   ")
        h.append("\t\n")
        assert h.entries == []
        assert h.cursor == 0

    @verifies(SWR.SWR_1153)
    def test_multiple_appends_ordered_oldest_first(self) -> None:
        h = _history_with("a", "b", "c")
        assert h.entries == ["a", "b", "c"]


# ---------------------------------------------------------------------------
# Capacity / eviction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1203)
class TestCapacity:
    @verifies(SWR.SWR_1153)
    def test_50_entries_no_eviction(self) -> None:
        h = PromptHistory(capacity=50)
        for i in range(50):
            h.append(f"entry{i}")
        assert len(h.entries) == 50
        assert h.entries[0] == "entry0"
        assert h.entries[-1] == "entry49"

    @verifies(SWR.SWR_1153, SWR.SWR_1156)
    def test_51st_entry_evicts_oldest(self) -> None:
        h = PromptHistory(capacity=50)
        for i in range(51):
            h.append(f"entry{i}")
        assert len(h.entries) == 50
        assert h.entries[0] == "entry1"
        assert h.entries[-1] == "entry50"

    @verifies(SWR.SWR_1153)
    def test_custom_capacity(self) -> None:
        h = PromptHistory(capacity=3)
        for s in ("a", "b", "c", "d"):
            h.append(s)
        assert h.entries == ["b", "c", "d"]

    @verifies(SWR.SWR_1153)
    def test_persistent_load_trims_to_capacity(self, tmp_path: Path) -> None:
        path = tmp_path / "prompt_history.json"
        path.write_text(json.dumps(["a", "b", "c", "d"]), encoding="utf-8")
        h = PromptHistory(capacity=3, path=path)
        assert h.entries == ["b", "c", "d"]
        assert h.cursor == 3


# ---------------------------------------------------------------------------
# prev() navigation
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1203)
class TestPrev:
    @verifies(SWR.SWR_1153)
    def test_prev_on_empty_returns_none(self) -> None:
        h = PromptHistory()
        assert h.prev() is None
        assert h.cursor == 0

    @verifies(SWR.SWR_1153, SWR.SWR_1154)
    def test_prev_once_gives_newest(self) -> None:
        h = _history_with("a", "b", "c")
        assert h.prev() == "c"
        assert h.cursor == 2

    @verifies(SWR.SWR_1153, SWR.SWR_1154)
    def test_prev_multiple_gives_older_entries(self) -> None:
        h = _history_with("a", "b", "c")
        results = [h.prev(), h.prev(), h.prev()]
        assert results == ["c", "b", "a"]

    @verifies(SWR.SWR_1153, SWR.SWR_1154)
    def test_prev_at_oldest_stays(self) -> None:
        h = _history_with("a", "b", "c")
        h.prev()
        h.prev()
        h.prev()  # now at oldest
        assert h.cursor == 0
        result = h.prev()  # should stay at oldest
        assert result == "a"
        assert h.cursor == 0

    @verifies(SWR.SWR_1153)
    def test_prev_ten_times_reverse_order(self) -> None:
        prompts = [f"prompt{i}" for i in range(10)]
        h = _history_with(*prompts)
        results = [h.prev() for _ in range(10)]
        assert results == list(reversed(prompts))


# ---------------------------------------------------------------------------
# next() navigation
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1203)
class TestNext:
    @verifies(SWR.SWR_1153)
    def test_next_on_empty_returns_empty_string(self) -> None:
        h = PromptHistory()
        result = h.next()
        assert result == ""
        assert h.at_unsent

    @verifies(SWR.SWR_1153)
    def test_next_from_unsent_stays_unsent(self) -> None:
        h = _history_with("a", "b")
        result = h.next()
        assert result == ""
        assert h.at_unsent

    @verifies(SWR.SWR_1153, SWR.SWR_1155)
    def test_next_after_prev_advances_forward(self) -> None:
        h = _history_with("a", "b", "c")
        h.prev()  # c
        h.prev()  # b
        assert h.next() == "c"

    @verifies(SWR.SWR_1153, SWR.SWR_1155)
    def test_next_from_oldest_to_unsent(self) -> None:
        h = _history_with("a", "b", "c")
        # go to oldest
        h.prev()
        h.prev()
        h.prev()
        # walk forward
        assert h.next() == "b"
        assert h.next() == "c"
        assert h.next() == ""
        assert h.at_unsent

    @verifies(SWR.SWR_1153)
    def test_full_round_trip(self) -> None:
        h = _history_with("x", "y", "z")
        # go to oldest
        h.prev()
        h.prev()
        h.prev()
        assert h.cursor == 0
        # walk forward to unsent
        assert h.next() == "y"
        assert h.next() == "z"
        assert h.next() == ""


# ---------------------------------------------------------------------------
# Submit resets cursor
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1203)
class TestSubmitResetsState:
    @verifies(SWR.SWR_1153)
    def test_submit_mid_history_resets_cursor(self) -> None:
        h = _history_with("a", "b", "c")
        h.prev()  # cursor at 2 (c)
        h.append("new")
        assert h.at_unsent
        assert h.entries[-1] == "new"

    @verifies(SWR.SWR_1153)
    def test_submit_then_prev_reaches_new_entry(self) -> None:
        h = _history_with("a", "b")
        h.prev()  # position at b
        h.append("c")
        assert h.prev() == "c"

    @verifies(SWR.SWR_1153, SWR.SWR_1158)
    def test_submit_blank_mid_history_not_recorded(self) -> None:
        h = _history_with("a", "b")
        h.prev()
        h.append("   ")
        assert h.entries == ["a", "b"]
        # cursor is still at 1 (b position) -- blank didn't reset
        assert h.cursor == 1


# ---------------------------------------------------------------------------
# at_unsent property
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1203)
class TestAtUnsent:
    @verifies(SWR.SWR_1153)
    def test_at_unsent_initially(self) -> None:
        assert PromptHistory().at_unsent

    @verifies(SWR.SWR_1153)
    def test_not_at_unsent_after_prev(self) -> None:
        h = _history_with("a")
        h.prev()
        assert not h.at_unsent

    @verifies(SWR.SWR_1153)
    def test_at_unsent_after_next_past_end(self) -> None:
        h = _history_with("a")
        h.prev()
        h.next()
        assert h.at_unsent


# ---------------------------------------------------------------------------
# reset_cursor
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1203)
class TestResetCursor:
    @verifies(SWR.SWR_1153)
    def test_reset_cursor_from_middle(self) -> None:
        h = _history_with("a", "b", "c")
        h.prev()
        h.reset_cursor()
        assert h.at_unsent
        assert h.cursor == 3


# ---------------------------------------------------------------------------
# persistence
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1203)
class TestPersistence:
    @verifies(SWR.SWR_1153, SWR.SWR_1160)
    def test_append_persists_across_instances(self, tmp_path: Path) -> None:
        path = tmp_path / "prompt_history.json"
        first = _persistent_history(path)
        first.append("alpha")
        first.append("beta")

        second = _persistent_history(path)
        assert second.entries == ["alpha", "beta"]
        assert second.at_unsent

    @verifies(SWR.SWR_1153)
    def test_blank_append_does_not_create_file(self, tmp_path: Path) -> None:
        path = tmp_path / "prompt_history.json"
        history = _persistent_history(path)
        history.append("   ")
        assert not path.exists()

    @verifies(SWR.SWR_1153)
    def test_corrupt_file_starts_empty(self, tmp_path: Path) -> None:
        path = tmp_path / "prompt_history.json"
        path.write_text("{not valid json", encoding="utf-8")
        history = _persistent_history(path)
        assert history.entries == []
        assert history.at_unsent

    @verifies(SWR.SWR_1153)
    def test_non_list_json_starts_empty(self, tmp_path: Path) -> None:
        path = tmp_path / "prompt_history.json"
        path.write_text(json.dumps({"entries": ["a"]}), encoding="utf-8")
        history = _persistent_history(path)
        assert history.entries == []
        assert history.at_unsent
