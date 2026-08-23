"""Productive use: Windows installation finishes with a clear optional launch action.
Expected outcome: the NSIS contract stays per-user, uninstallable, and launch-enabled."""

from __future__ import annotations

from pathlib import Path

from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_3001, SWR.SWR_3715)
def test_nsis_finish_page_offers_checked_launch_without_elevation() -> None:
    """Productive use: an installer user opens Rotaris directly after files are copied.
    Expected outcome: the finish page runs Rotaris by default while retaining per-user scope."""
    source = Path("packaging/installer/rotaris.nsi").read_text(encoding="utf-8")

    assert '!define MUI_FINISHPAGE_RUN "$INSTDIR\\${APP_EXE}"' in source
    assert '!define MUI_FINISHPAGE_RUN_TEXT "Launch Rotaris"' in source
    assert "RequestExecutionLevel user" in source
    assert 'InstallDir "$LOCALAPPDATA\\${APP_NAME}"' in source
    assert "WriteUninstaller" in source
