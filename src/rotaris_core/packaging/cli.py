"""``python -m rotaris_core.packaging`` — build and release commands.

One entry point for both halves of distribution: :mod:`~rotaris_core.packaging.build`
freezes a binary (SWR-3001), :mod:`~rotaris_core.packaging.release` describes the
release that carries it (SWR-3002). The release workflow calls these commands
rather than reimplementing the logic in shell, so what CI does is what the tests
cover.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.packaging.build import DEFAULT_MODE, build
from rotaris_core.packaging.pyinstaller import ENTRY_POINTS, repo_root
from rotaris_core.packaging.release import (
    CHECKSUM_FILE,
    VersionMismatchError,
    changelog,
    checksum_lines,
    release_channel,
    release_notes,
    verify_versions,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence


def _assets(dist: Path) -> list[Path]:
    """Release assets sitting in a directory, ignoring the manifest itself."""
    return [
        path for path in sorted(dist.iterdir()) if path.is_file() and path.name != CHECKSUM_FILE
    ]


@traces(SWR.SWR_3001)
def _run_build(args: argparse.Namespace) -> int:
    result = build(args.target, mode=args.mode, output_dir=args.output)
    print(f"{result.target} ({result.mode}) -> {result.artifact}")
    return 0


@traces(SWR.SWR_3002)
def _run_verify_version(args: argparse.Namespace) -> int:
    """Print the agreed version, or explain the disagreement and fail (AC-006)."""
    version = verify_versions(args.ref, args.root or repo_root())
    print(version)
    return 0


@traces(SWR.SWR_3002)
def _run_release_channel(args: argparse.Namespace) -> int:
    """Print ``stable`` or ``prerelease`` for workflow policy decisions."""
    print(release_channel(args.version))
    return 0


@traces(SWR.SWR_3002)
def _run_checksums(args: argparse.Namespace) -> int:
    """Write ``SHA256SUMS.txt`` next to the collected artifacts (AC-004)."""
    dist: Path = args.dist
    if not dist.is_dir():
        raise FileNotFoundError(f"no artifact directory at {dist}")
    manifest = dist / CHECKSUM_FILE
    manifest.write_text(checksum_lines(_assets(dist)), encoding="utf-8")
    print(manifest)
    return 0


@traces(SWR.SWR_3002)
def _run_notes(args: argparse.Namespace) -> int:
    """Render the release body from the artifacts that actually arrived (AC-003)."""
    dist: Path = args.dist
    if not dist.is_dir():
        raise FileNotFoundError(f"no artifact directory at {dist}")
    root = args.root or repo_root()
    body = release_notes(
        args.version,
        present=_assets(dist),
        changes=changelog(args.version, root),
    )
    if args.output is not None:
        args.output.write_text(body, encoding="utf-8")
        print(args.output)
    else:
        print(body)
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m rotaris_core.packaging",
        description="Build Rotaris standalone binaries and describe the release that ships them.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    build_parser = sub.add_parser("build", help="freeze one entry point")
    build_parser.add_argument("target", choices=sorted(ENTRY_POINTS), help="entry point to freeze")
    build_parser.add_argument(
        "--mode",
        choices=("onedir", "onefile"),
        default=DEFAULT_MODE,
        help="onedir (default, fast start) or onefile (portable, slow start)",
    )
    build_parser.add_argument("--output", type=Path, default=None, help="dist directory")
    build_parser.set_defaults(handler=_run_build)

    verify_parser = sub.add_parser(
        "verify-version", help="check a release tag against both pyproject versions"
    )
    verify_parser.add_argument("ref", help="tag or full ref, e.g. v1.2.3 or refs/tags/v1.2.3")
    verify_parser.add_argument("--root", type=Path, default=None, help="checkout to inspect")
    verify_parser.set_defaults(handler=_run_verify_version)

    channel_parser = sub.add_parser("release-channel", help="classify a supported product version")
    channel_parser.add_argument("version", help="version without the leading v")
    channel_parser.set_defaults(handler=_run_release_channel)

    checksums_parser = sub.add_parser(
        "checksums", help=f"write {CHECKSUM_FILE} for the collected artifacts"
    )
    checksums_parser.add_argument("--dist", type=Path, required=True, help="artifact directory")
    checksums_parser.set_defaults(handler=_run_checksums)

    notes_parser = sub.add_parser("notes", help="render the GitHub Release body")
    notes_parser.add_argument("--version", required=True, help="release version, without the v")
    notes_parser.add_argument("--dist", type=Path, required=True, help="artifact directory")
    notes_parser.add_argument(
        "--root", type=Path, default=None, help="checkout to read history from"
    )
    notes_parser.add_argument(
        "--output", type=Path, default=None, help="write here instead of stdout"
    )
    notes_parser.set_defaults(handler=_run_notes)

    return parser


@traces(SWR.SWR_3002)
def main(argv: Sequence[str] | None = None) -> int:
    """Dispatch a packaging command, reporting failures as a reason and exit 1."""
    args = _parser().parse_args(list(argv) if argv is not None else None)
    try:
        handler: int = args.handler(args)
    except (ValueError, FileNotFoundError, RuntimeError, VersionMismatchError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return handler
