from __future__ import annotations

import asyncio
import contextlib
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import logging

    from rotaris_core.orchestrator.artifacts import ArtifactRecord, SessionArtifactStore
    from rotaris_core.tui.app import RotarisTuiApp


def _canonical_name(agent: dict[str, Any]) -> str:
    return str(agent.get("canonical_name") or agent.get("name") or "")


def current_artifact_store(
    app: RotarisTuiApp,
    logger: logging.Logger,
) -> SessionArtifactStore | None:
    if app._active_ralph_loop is not None:
        store = app._active_ralph_loop.artifact_store
        if app.current_session is not None:
            app._artifact_store_cache_session_id = app.current_session.session_id
            app._artifact_store_cache = store
        return store

    if app.current_session is None or app.session_manager is None:
        return None

    session_id = app.current_session.session_id
    if app._artifact_store_cache_session_id == session_id and app._artifact_store_cache:
        return app._artifact_store_cache

    from rotaris_core.orchestrator.artifacts import SessionArtifactStore

    store = SessionArtifactStore(app.session_manager.session_dir(session_id))
    try:
        store.hydrate()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to hydrate artifact store for session %s", session_id)
        return None
    app._artifact_store_cache_session_id = session_id
    app._artifact_store_cache = store
    return store


def visible_artifact_records(
    app: RotarisTuiApp,
    logger: logging.Logger,
) -> list[ArtifactRecord]:
    store = current_artifact_store(app, logger)
    if store is None or app.current_session is None:
        return []

    if app.focused_agent_id is None:
        return store.list(include_superseded=False)

    focused_child = focused_child_state(app)
    if focused_child is None:
        return []

    ids = [
        *list(focused_child.get("produced_artifact_ids") or []),
        *list(focused_child.get("received_artifact_ids") or []),
    ]
    records: list[ArtifactRecord] = []
    seen: set[str] = set()
    for artifact_id in ids:
        artifact_id = str(artifact_id)
        if not artifact_id or artifact_id in seen:
            continue
        seen.add(artifact_id)
        record = store.get(artifact_id)
        if record is None or record.superseded_by is not None:
            continue
        records.append(record)
    return records


def focused_child_state(app: RotarisTuiApp) -> dict[str, Any] | None:
    if app.current_session is None or app.focused_agent_id is None:
        return None
    for child in app.current_session.child_states:
        if _canonical_name(child) == app.focused_agent_id:
            return child
    return None


async def focus_artifact_action(
    app: RotarisTuiApp,
    *,
    direction: int,
    logger: logging.Logger,
) -> None:
    if app.artifact_inspect_mode:
        from textual.css.query import NoMatches

        from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor

        try:
            editor = app.screen.query_one(ArtifactEditor)
            if editor.dirty:
                app.notify(
                    f"Save ({app.format_leader_chord('s')}) or exit (Esc) before navigating.",
                    severity="warning",
                    timeout=3,
                )
                return
        except NoMatches:
            pass
        focus_artifact(app, direction=direction, logger=logger)
        if app.focused_artifact_id is not None:
            await enter_artifact_inspector(app, app.focused_artifact_id, logger=logger)
    else:
        focus_artifact(app, direction=direction, logger=logger)


@traces(SWR.SWR_1540, SWR.SWR_1542)
def focus_artifact(
    app: RotarisTuiApp,
    *,
    direction: int,
    logger: logging.Logger,
) -> None:
    records = visible_artifact_records(app, logger)
    if not records:
        app.notify("No artifacts for this view yet.", severity="warning", timeout=2)
        return
    ids = [record.id for record in records]
    if app.focused_artifact_id not in ids:
        app.focused_artifact_id = ids[0]
        return
    current_index = ids.index(app.focused_artifact_id)
    app.focused_artifact_id = ids[(current_index + direction) % len(ids)]


async def enter_artifact_inspector(
    app: RotarisTuiApp,
    artifact_id: str,
    *,
    logger: logging.Logger,
) -> None:
    from textual.css.query import NoMatches
    from textual.widgets import ContentSwitcher

    from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor

    store = current_artifact_store(app, logger)
    record = store.get(artifact_id) if store is not None else None
    if record is None:
        app.notify("Artifact not found.", severity="warning")
        return

    switcher = app.screen.query_one("#transcript-switcher", ContentSwitcher)
    with contextlib.suppress(NoMatches):
        old_editor = switcher.query_one(ArtifactEditor)
        await old_editor.remove()

    editor = ArtifactEditor(
        artifact_id=record.id,
        slug=record.slug,
        text=record.body_markdown,
    )
    await switcher.mount(editor)
    switcher.current = "artifact-editor"
    app.artifact_inspect_mode = True
    editor.focus()


def exit_artifact_inspector(app: RotarisTuiApp, *, require_confirm: bool) -> None:
    from textual.css.query import NoMatches

    from rotaris_core.tui.screens.modals import DiscardArtifactEditsScreen
    from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor

    if not app.artifact_inspect_mode:
        app.focused_artifact_id = None
        return
    try:
        editor = app.screen.query_one(ArtifactEditor)
    except NoMatches:
        exit_artifact_inspector_now(app)
        return
    if require_confirm and editor.dirty:

        def on_discard_response(discard: bool | None) -> None:
            if discard:
                exit_artifact_inspector_now(app)
            else:
                editor.focus()

        app.push_screen(DiscardArtifactEditsScreen(), on_discard_response)
        return
    exit_artifact_inspector_now(app)


def exit_artifact_inspector_now(app: RotarisTuiApp) -> None:
    from textual.css.query import NoMatches
    from textual.widgets import ContentSwitcher

    from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor

    try:
        switcher = app.screen.query_one("#transcript-switcher", ContentSwitcher)
    except NoMatches:
        app.artifact_inspect_mode = False
        return
    switcher.current = "chat-panel"
    with contextlib.suppress(NoMatches):
        editor = switcher.query_one(ArtifactEditor)
        editor.remove()
    app.artifact_inspect_mode = False


def save_artifact(
    app: RotarisTuiApp,
    artifact_id: str,
    body_markdown: str,
    *,
    logger: logging.Logger,
) -> None:
    async def _save() -> None:
        store = current_artifact_store(app, logger)
        if store is None:
            app.notify("No artifact store available.", severity="error")
            return
        try:
            await asyncio.to_thread(store.update_body, artifact_id, body_markdown)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to save artifact %s", artifact_id)
            app.notify(f"Artifact save failed: {exc}", severity="error")
            return

        from textual.css.query import NoMatches

        from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor

        with contextlib.suppress(NoMatches):
            editor = app.screen.query_one(ArtifactEditor)
            if editor.artifact_id == artifact_id:
                editor.mark_saved(body_markdown)
        app.notify("Artifact saved", severity="information", timeout=2)
        app._refresh_widgets()

    task = asyncio.create_task(_save())
    app._artifact_save_tasks.add(task)
    task.add_done_callback(app._artifact_save_tasks.discard)
