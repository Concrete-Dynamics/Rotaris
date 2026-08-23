"""Productive use: users and release automation identify a Rotaris desktop artifact.
Expected outcome: --version exits before QApplication creation or machine setup initialization."""

from __future__ import annotations

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris import __version__
from rotaris.main import main

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_3001, SWR.SWR_3715)
def test_version_exits_before_qapplication_and_setup(monkeypatch, capsys) -> None:  # type: ignore[no-untyped-def]
    """Productive use: artifact smoke automation asks the executable for its version.
    Expected outcome: version output succeeds without constructing GUI or provisioning state."""

    class ForbiddenApplication:
        @staticmethod
        def instance() -> None:
            raise AssertionError("QApplication initialized during --version")

    monkeypatch.setattr("rotaris.main.QApplication", ForbiddenApplication)

    assert main(["--version"]) == 0
    assert capsys.readouterr().out.strip() == f"Rotaris {__version__}"
