from __future__ import annotations

import json

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.stash import PromptStash


@pytest.fixture
def stash(tmp_path: object) -> PromptStash:
    from pathlib import Path

    return PromptStash(path=Path(str(tmp_path)) / "stash.json")


@verifies(SWR.SWR_1101, SWR.SWR_1120)
def test_push_and_pop_lifo_order(stash: PromptStash) -> None:
    stash.push("first")
    stash.push("second")
    stash.push("third")
    assert stash.pop() == "third"
    assert stash.pop() == "second"
    assert stash.pop() == "first"


@verifies(SWR.SWR_1101)
def test_pop_empty_returns_none(stash: PromptStash) -> None:
    assert stash.pop() is None


@verifies(SWR.SWR_1101)
def test_peek_returns_top_without_removal(stash: PromptStash) -> None:
    stash.push("alpha")
    stash.push("beta")
    assert stash.peek() == "beta"
    assert stash.size == 2


@verifies(SWR.SWR_1101)
def test_peek_empty_returns_none(stash: PromptStash) -> None:
    assert stash.peek() is None


@verifies(SWR.SWR_1101)
def test_size_and_is_empty(stash: PromptStash) -> None:
    assert stash.is_empty is True
    assert stash.size == 0
    stash.push("x")
    assert stash.is_empty is False
    assert stash.size == 1


@verifies(SWR.SWR_1101)
def test_push_empty_string_is_noop(stash: PromptStash) -> None:
    stash.push("")
    assert stash.size == 0


@verifies(SWR.SWR_1101)
def test_persistence_across_instances(tmp_path: object) -> None:
    from pathlib import Path

    path = Path(str(tmp_path)) / "stash.json"
    s1 = PromptStash(path=path)
    s1.push("persisted")
    s1.push("also persisted")

    s2 = PromptStash(path=path)
    assert s2.size == 2
    assert s2.pop() == "also persisted"
    assert s2.pop() == "persisted"


@verifies(SWR.SWR_1101)
def test_pop_persists_removal(tmp_path: object) -> None:
    from pathlib import Path

    path = Path(str(tmp_path)) / "stash.json"
    s1 = PromptStash(path=path)
    s1.push("a")
    s1.push("b")
    s1.pop()

    s2 = PromptStash(path=path)
    assert s2.size == 1
    assert s2.pop() == "a"


@verifies(SWR.SWR_1101)
def test_corrupt_file_starts_empty(tmp_path: object) -> None:
    from pathlib import Path

    path = Path(str(tmp_path)) / "stash.json"
    path.write_text("not valid json {{{", encoding="utf-8")
    s = PromptStash(path=path)
    assert s.is_empty is True


@verifies(SWR.SWR_1101)
def test_non_list_json_starts_empty(tmp_path: object) -> None:
    from pathlib import Path

    path = Path(str(tmp_path)) / "stash.json"
    path.write_text(json.dumps({"not": "a list"}), encoding="utf-8")
    s = PromptStash(path=path)
    assert s.is_empty is True


@verifies(SWR.SWR_1101)
def test_file_created_on_first_push(tmp_path: object) -> None:
    from pathlib import Path

    path = Path(str(tmp_path)) / "subdir" / "stash.json"
    assert not path.exists()
    s = PromptStash(path=path)
    s.push("hello")
    assert path.exists()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data == ["hello"]
