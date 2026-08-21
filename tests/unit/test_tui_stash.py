from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import patch

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import PopInput, RotarisTuiApp
from rotaris_core.tui.stash import PromptStash
from rotaris_core.tui.widgets.input_composer import InputComposer

if TYPE_CHECKING:
    from pathlib import Path


async def _press_leader_shortcut(pilot, key: str) -> None:
    await pilot.press("ctrl+x")
    await pilot.pause()
    await pilot.press(key)
    await pilot.pause()


def _make_init(stash_path: Path, *, load: bool = False):  # noqa: ANN202
    """Return a replacement ``__init__`` for ``PromptStash``."""

    def _init(self: PromptStash, path: Path | None = None) -> None:
        self._path = stash_path  # type: ignore[attr-defined]
        self._stack = PromptStash._load(self) if load else []  # type: ignore[attr-defined]

    return _init


@verifies(SWR.SWR_1101, SWR.SWR_1102, SWR.SWR_1103, SWR.SWR_1107, SWR.SWR_1172)
async def test_stash_via_leader_s_clears_input(tmp_path: Path) -> None:
    stash_path = tmp_path / "stash.json"
    app = RotarisTuiApp()
    with patch.object(PromptStash, "__init__", _make_init(stash_path)):
        async with app.run_test(notifications=True) as pilot:
            await pilot.pause()
            composer = app.screen.query_one(InputComposer)

            await pilot.press("h", "e", "l", "l", "o")
            await pilot.pause()
            assert composer.get_text() == "hello"

            await pilot.press("ctrl+s")
            await pilot.pause()
            assert composer.get_text() == "hello"

            await _press_leader_shortcut(pilot, "s")

            assert composer.get_text() == ""

            await _press_leader_shortcut(pilot, "s")

            assert any("Nothing to stash" in str(n.message) for n in app._notifications)

            app.post_message(PopInput())
            await pilot.pause()

            assert composer.get_text() == "hello"

            app.post_message(PopInput())
            await pilot.pause()

            assert any("Stash is empty" in str(n.message) for n in app._notifications)


@verifies(SWR.SWR_1105)
async def test_pop_restores_to_empty_input(tmp_path: Path) -> None:
    stash_path = tmp_path / "stash.json"
    stash = PromptStash(path=stash_path)
    stash.push("restored text")

    app = RotarisTuiApp()
    with patch.object(PromptStash, "__init__", _make_init(stash_path, load=True)):
        async with app.run_test() as pilot:
            await pilot.pause()

            app.post_message(PopInput())
            await pilot.pause()

            composer = app.screen.query_one(InputComposer)
            assert composer.get_text() == "restored text"


@verifies(SWR.SWR_1106, SWR.SWR_1117)
async def test_pop_appends_to_existing_input(tmp_path: Path) -> None:
    stash_path = tmp_path / "stash.json"
    stash = PromptStash(path=stash_path)
    stash.push(" world")

    app = RotarisTuiApp()
    with patch.object(PromptStash, "__init__", _make_init(stash_path, load=True)):
        async with app.run_test() as pilot:
            await pilot.pause()

            await pilot.press("h", "e", "l", "l", "o")
            await pilot.pause()

            app.post_message(PopInput())
            await pilot.pause()

            composer = app.screen.query_one(InputComposer)
            assert composer.get_text() == "hello world"


@verifies(SWR.SWR_1108, SWR.SWR_1110)
async def test_command_palette_includes_stash_entries() -> None:
    from rotaris_core.tui.providers.command_palette import RotarisCommandPalette

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        provider = RotarisCommandPalette(app.screen)

        hits: list[str] = []
        async for hit in provider.search("stash"):
            hits.append(str(hit.match_display))

        assert any("tash" in h.lower() for h in hits)


@verifies(SWR.SWR_1104, SWR.SWR_1109)
async def test_meta_bar_shows_stash_count(tmp_path: Path) -> None:
    stash_path = tmp_path / "stash.json"
    stash = PromptStash(path=stash_path)
    stash.push("item1")
    stash.push("item2")

    app = RotarisTuiApp()
    with patch.object(PromptStash, "__init__", _make_init(stash_path, load=True)):
        async with app.run_test() as pilot:
            await pilot.pause()
            composer = app.screen.query_one(InputComposer)
            assert composer._stash_count == 2


# ---------------------------------------------------------------------------
# Category 3: Stash — Random Interaction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1101)
async def test_stash_random_interaction_no_crash(tmp_path: Path) -> None:
    """Random interaction: rapid stash/pop cycles must not crash."""
    stash_path = tmp_path / "stash.json"

    app = RotarisTuiApp()
    with patch.object(PromptStash, "__init__", _make_init(stash_path)):
        async with app.run_test(notifications=True) as pilot:
            await pilot.pause()

            # Rapid stash/pop cycles.
            await _press_leader_shortcut(pilot, "s")
            app.post_message(PopInput())
            await pilot.pause()
            await _press_leader_shortcut(pilot, "s")
            await _press_leader_shortcut(pilot, "s")

            # Resize during stash ops.
            from textual.events import Resize
            from textual.geometry import Size

            app.post_message(Resize(Size(100, 30), Size(80, 24)))
            await pilot.pause()

            # Should still be queryable.
            assert app.screen.query_one(InputComposer) is not None
