"""Productive use: a user can trust archives installed by Rotaris.
Expected outcome: digests and archive boundaries are verified before atomic promotion."""

from __future__ import annotations

import hashlib
import io
import ssl
import tarfile
import zipfile
from typing import TYPE_CHECKING
from unittest.mock import Mock

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.setup.download import (
    SetupSupplyError,
    extract_and_promote,
    setup_tls_context,
    verify_sha256,
)
from rotaris_core.setup.models import PlatformArtifact, ToolSpec

if TYPE_CHECKING:
    from pathlib import Path


def _spec(artifact: PlatformArtifact) -> ToolSpec:
    return ToolSpec(
        "demo",
        "demo",
        ("--version",),
        "1.0.0",
        "1.0.0",
        {"test": artifact},
        (".",),
        "MIT",
        ("demo",),
    )


@verifies(SWR.SWR_3715)
def test_setup_download_trusts_system_and_bundled_ca_roots(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: an AppImage user downloads a pinned tool over HTTPS.
    Expected outcome: public CAs travel with the AppImage and organisation CAs stay trusted."""
    context = Mock(spec=ssl.SSLContext)
    monkeypatch.setattr("rotaris_core.setup.download.ssl.create_default_context", lambda: context)
    monkeypatch.setattr("rotaris_core.setup.download.certifi.where", lambda: "/bundle/cacert.pem")

    assert setup_tls_context() is context
    context.load_verify_locations.assert_called_once_with(cafile="/bundle/cacert.pem")


@verifies(SWR.SWR_3715)
def test_sha_mismatch_reports_both_digests(tmp_path: Path) -> None:
    """Productive use: a corrupted download never reaches extraction.
    Expected outcome: the failure names expected and actual SHA-256 values."""
    archive = tmp_path / "tool.zip"
    archive.write_bytes(b"corrupt")
    expected = "0" * 64
    actual = hashlib.sha256(b"corrupt").hexdigest()

    with pytest.raises(SetupSupplyError, match=f"expected {expected}, actual {actual}"):
        verify_sha256(archive, expected)


@verifies(SWR.SWR_3715)
@pytest.mark.parametrize("kind", ["zip", "tar.gz"])
def test_malicious_archive_path_is_refused_without_promotion(tmp_path: Path, kind: str) -> None:
    """Productive use: installing a tool cannot overwrite files elsewhere in user storage.
    Expected outcome: traversal entries fail in staging and the managed destination stays absent."""
    archive = tmp_path / ("evil.zip" if kind == "zip" else "evil.tar.gz")
    if kind == "zip":
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("../escape", b"bad")
    else:
        with tarfile.open(archive, "w:gz") as bundle:
            info = tarfile.TarInfo("../escape")
            info.size = 3
            bundle.addfile(info, io.BytesIO(b"bad"))
    artifact = PlatformArtifact("https://example.test/tool", "0" * 64, kind, ("demo",), 0)
    destination = tmp_path / "tools" / "demo" / "1.0.0"

    with pytest.raises(SetupSupplyError, match="escapes"):
        extract_and_promote(archive, artifact, _spec(artifact), destination)

    assert not destination.exists()
    assert not (tmp_path / "escape").exists()


@verifies(SWR.SWR_3715)
def test_matching_archive_promotes_complete_tree(tmp_path: Path) -> None:
    """Productive use: a verified archive becomes an immutable managed tool installation.
    Expected outcome: expected executables appear together through one atomic directory promotion."""
    archive = tmp_path / "tool.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("demo-1.0.0/demo", b"binary")
    artifact = PlatformArtifact("https://example.test/tool", "0" * 64, "zip", ("demo",), 1)
    destination = tmp_path / "tools" / "demo" / "1.0.0"

    executables = extract_and_promote(archive, artifact, _spec(artifact), destination)

    assert executables == (destination / "demo",)
    assert executables[0].read_bytes() == b"binary"
