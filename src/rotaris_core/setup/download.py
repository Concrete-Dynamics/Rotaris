"""Verified resumable downloads and traversal-safe archive extraction."""

from __future__ import annotations

import hashlib
import os
import shutil
import ssl
import stat
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING

import certifi

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from .models import PlatformArtifact, ToolSpec


class SetupSupplyError(RuntimeError):
    pass


@traces(SWR.SWR_3715)
def setup_tls_context() -> ssl.SSLContext:
    """Trust the host's configured roots and the bundled public CA bundle.

    PyInstaller's Linux runtime can lose OpenSSL's compiled-in CA path. Loading
    certifi explicitly keeps public release downloads available from an AppImage,
    while the default context retains system-installed organisation roots.
    """
    context = ssl.create_default_context()
    context.load_verify_locations(cafile=certifi.where())
    return context


@traces(SWR.SWR_3715)
def setup_url_opener() -> urllib.request.OpenerDirector:
    """Create the HTTPS client used for verified setup downloads."""
    return urllib.request.build_opener(urllib.request.HTTPSHandler(context=setup_tls_context()))


def _safe_relative(name: str, strip_components: int) -> Path | None:
    normalized = name.replace("\\", "/")
    source = PurePosixPath(normalized)
    if source.is_absolute() or ".." in source.parts:
        raise SetupSupplyError(f"archive entry escapes the staging directory: {name}")
    parts = source.parts[strip_components:]
    if not parts:
        return None
    target = Path(*parts)
    if target.is_absolute() or ".." in target.parts:
        raise SetupSupplyError(f"archive entry escapes the staging directory: {name}")
    return target


@traces(SWR.SWR_3715)
def verify_sha256(path: Path, expected: str) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    actual = digest.hexdigest()
    if actual.lower() != expected.lower():
        raise SetupSupplyError(f"SHA-256 mismatch: expected {expected.lower()}, actual {actual}")
    return actual


@traces(SWR.SWR_3715)
def download_archive(
    artifact: PlatformArtifact,
    destination: Path,
    *,
    opener: urllib.request.OpenerDirector | None = None,
) -> Path:
    if not artifact.url.startswith("https://"):
        raise SetupSupplyError("tool archives require HTTPS")
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".partial")
    offset = partial.stat().st_size if partial.exists() else 0
    request = urllib.request.Request(
        artifact.url,
        headers={
            "User-Agent": "Rotaris-Setup/1",
            **({"Range": f"bytes={offset}-"} if offset else {}),
        },
    )
    client = opener or setup_url_opener()
    try:
        response = client.open(request, timeout=30)
    except OSError as exc:
        raise SetupSupplyError(f"download failed for {artifact.url}: {exc}") from exc
    status = getattr(response, "status", 200)
    mode = "ab" if offset and status == 206 else "wb"
    with response, partial.open(mode) as stream:
        shutil.copyfileobj(response, stream, length=1024 * 1024)
        stream.flush()
        os.fsync(stream.fileno())
    verify_sha256(partial, artifact.sha256)
    os.replace(partial, destination)
    return destination


def _extract_zip(archive: Path, destination: Path, strip_components: int) -> None:
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            relative = _safe_relative(info.filename, strip_components)
            if relative is None:
                continue
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise SetupSupplyError(f"archive symlink is unsupported: {info.filename}")
            target = destination / relative
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(info) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
            if mode & stat.S_IXUSR:
                target.chmod(target.stat().st_mode | stat.S_IXUSR)


def _extract_tar(archive: Path, destination: Path, strip_components: int) -> None:
    with tarfile.open(archive, mode="r:*") as bundle:
        for member in bundle.getmembers():
            relative = _safe_relative(member.name, strip_components)
            if relative is None:
                continue
            if member.issym() or member.islnk():
                raise SetupSupplyError(f"archive link is unsupported: {member.name}")
            target = destination / relative
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            source = bundle.extractfile(member)
            if source is None:
                raise SetupSupplyError(f"archive member cannot be read: {member.name}")
            with source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
            target.chmod((member.mode & 0o777) or 0o755)


@traces(SWR.SWR_3715)
def extract_and_promote(
    archive: Path,
    artifact: PlatformArtifact,
    spec: ToolSpec,
    destination: Path,
) -> tuple[Path, ...]:
    """Extract into sibling staging and atomically promote a verified tree."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        executables = tuple(destination / item for item in artifact.executable_paths)
        if all(path.is_file() for path in executables):
            return executables
        raise SetupSupplyError(f"managed tool directory is incomplete: {destination}")
    staging = Path(tempfile.mkdtemp(prefix=f".{spec.name}-", dir=destination.parent))
    try:
        if artifact.archive == "zip":
            _extract_zip(archive, staging, artifact.strip_components)
        elif artifact.archive in {"tar.gz", "tar.xz"}:
            _extract_tar(archive, staging, artifact.strip_components)
        else:
            raise SetupSupplyError(f"unsupported archive format: {artifact.archive}")
        executables = tuple(staging / item for item in artifact.executable_paths)
        missing = [str(path.relative_to(staging)) for path in executables if not path.is_file()]
        if missing:
            raise SetupSupplyError(f"archive is missing expected executables: {', '.join(missing)}")
        for executable in executables:
            if os.name != "nt":
                executable.chmod(executable.stat().st_mode | stat.S_IXUSR)
        os.replace(staging, destination)
        return tuple(destination / item for item in artifact.executable_paths)
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
