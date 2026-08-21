from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.mcp_toggles import MCPToggleStore

if TYPE_CHECKING:
    from pathlib import Path

    from _pytest.logging import LogCaptureFixture


@verifies(SWR.SWR_1708)
def test_is_enabled_defaults_to_true_when_file_missing(tmp_path: Path) -> None:
    path = tmp_path / "mcp_toggles.json"

    store = MCPToggleStore(path)

    assert store.is_enabled("foo") is True
    assert store.all_states() == {}


@verifies(SWR.SWR_1708)
def test_set_enabled_persists_false_state(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "mcp_toggles.json"
    store = MCPToggleStore(path)

    store.set_enabled("foo", False)

    assert store.is_enabled("foo") is False
    assert json.loads(path.read_text(encoding="utf-8")) == {"foo": False}


@verifies(SWR.SWR_1708)
def test_state_persists_across_instances(tmp_path: Path) -> None:
    path = tmp_path / "mcp_toggles.json"
    first_store = MCPToggleStore(path)
    first_store.set_enabled("foo", False)

    second_store = MCPToggleStore(path)

    assert second_store.is_enabled("foo") is False
    assert second_store.is_enabled("bar") is True
    assert second_store.all_states() == {"foo": False}


@verifies(SWR.SWR_1708)
def test_corrupt_json_logs_warning_and_starts_empty(
    tmp_path: Path,
    caplog: LogCaptureFixture,
) -> None:
    path = tmp_path / "mcp_toggles.json"
    _ = path.write_text("{not valid json", encoding="utf-8")

    with caplog.at_level(logging.WARNING):
        store = MCPToggleStore(path)

    assert store.all_states() == {}
    assert store.is_enabled("foo") is True
    assert "Failed to load MCP toggles" in caplog.text


@verifies(SWR.SWR_1708)
def test_atomic_write_cleans_up_temp_file(tmp_path: Path) -> None:
    path = tmp_path / "mcp_toggles.json"
    store = MCPToggleStore(path)

    store.set_enabled("foo", False)

    assert json.loads(path.read_text(encoding="utf-8")) == {"foo": False}
    assert sorted(entry.name for entry in tmp_path.iterdir()) == ["mcp_toggles.json"]


@verifies(SWR.SWR_1708)
def test_all_states_only_returns_explicit_entries(tmp_path: Path) -> None:
    path = tmp_path / "mcp_toggles.json"
    store = MCPToggleStore(path)

    assert store.is_enabled("implicit-default") is True
    store.set_enabled("explicit-false", False)

    assert store.all_states() == {"explicit-false": False}


@verifies(SWR.SWR_1708)
def test_reload_picks_up_out_of_band_changes(tmp_path: Path) -> None:
    path = tmp_path / "mcp_toggles.json"
    store = MCPToggleStore(path)
    store.set_enabled("foo", False)
    _ = path.write_text('{"foo": true, "bar": false}', encoding="utf-8")

    store.reload()

    assert store.is_enabled("foo") is True
    assert store.is_enabled("bar") is False
    assert store.all_states() == {"foo": True, "bar": False}


@verifies(SWR.SWR_1708)
def test_concurrent_set_enabled_calls_do_not_corrupt_file(tmp_path: Path) -> None:
    path = tmp_path / "mcp_toggles.json"
    store = MCPToggleStore(path)
    expected = {f"server_{index}": index % 2 == 0 for index in range(20)}

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [
            executor.submit(store.set_enabled, name, enabled) for name, enabled in expected.items()
        ]
        for future in futures:
            future.result()

    assert json.loads(path.read_text(encoding="utf-8")) == expected
    assert MCPToggleStore(path).all_states() == expected
