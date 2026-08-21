"""ReqToCode command line (blueprint §7): toolchain-free enforcement entry.

Usage:
    python -m rotaris_core.reqtocode check [--fix] [--update-baseline]
    python -m rotaris_core.reqtocode generate
    python -m rotaris_core.reqtocode diff [--base <ref>] [--strict]

Exit codes: 0 ok / 1 violations / 2 internal error. Stdlib-only; the
pre-commit hook runs this without the project venv (src/ on sys.path).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode.diff import compute_requirement_diff, render_diff
from rotaris_core.reqtocode.generator import parse_requirements, regenerate_if_stale
from rotaris_core.reqtocode.layout import (
    CONFIG_FILENAME,
    DEFAULT_LAYOUT,
    LayoutError,
    RepoLayout,
    load_layout,
)
from rotaris_core.reqtocode.verifier import (
    compute_baseline,
    compute_orphan_baseline,
    compute_orphan_test_baseline,
    load_baseline,
    load_orphan_baseline,
    load_test_orphan_baseline,
    render_baseline,
    render_orphan_baseline,
    render_test_orphan_baseline,
    verify,
)

if TYPE_CHECKING:
    from rotaris_core.reqtocode.conventions import ConventionRegistry


def find_repo_root(start: Path | None = None, layout: RepoLayout | None = None) -> Path:
    """Walk up to the repository that owns the requirement store.

    A directory carrying the layout config file wins outright; otherwise the
    requirement store plus at least one implementation root identifies the root.
    """
    layout = layout if layout is not None else DEFAULT_LAYOUT
    current = (start or Path(__file__).resolve()).parent
    for candidate in (current, *current.parents):
        if (candidate / CONFIG_FILENAME).is_file():
            return candidate
        if (candidate / layout.requirements_dir).is_dir() and any(
            (candidate / root).is_dir() for root in layout.impl_roots
        ):
            return candidate
    return Path.cwd()


def _update_baseline(repo_root: Path, layout: RepoLayout | None = None) -> None:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    missing = compute_baseline(repo_root, None, layout)
    existing, _ = load_baseline(repo_root, layout)
    baseline_file = repo_root / layout.baseline_path
    if baseline_file.is_file():
        # Shrink-only ratchet: keep the intersection of old debt and current debt.
        pruned = {
            number: existing[number] & missing.get(number, set())
            for number in existing
            if existing[number] & missing.get(number, set())
        }
    else:
        pruned = missing  # bootstrap: record all pre-existing debt once
    baseline_file.parent.mkdir(parents=True, exist_ok=True)
    baseline_file.write_text(render_baseline(pruned), encoding="utf-8", newline="\n")
    print(
        f"[reqtocode] baseline written: {layout.baseline_path.as_posix()} ({len(pruned)} entries)"
    )
    _update_orphan_baseline(repo_root, layout)
    _update_test_orphan_baseline(repo_root, layout)


def _update_orphan_baseline(repo_root: Path, layout: RepoLayout | None = None) -> None:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    current = compute_orphan_baseline(repo_root, None, layout)
    existing, _ = load_orphan_baseline(repo_root, layout)
    orphan_file = repo_root / layout.orphan_baseline_path
    # Shrink-only: keep only entries that are still orphan (paid/removed ones drop).
    pruned = current if not orphan_file.is_file() else existing & current
    orphan_file.parent.mkdir(parents=True, exist_ok=True)
    orphan_file.write_text(render_orphan_baseline(pruned, layout), encoding="utf-8", newline="\n")
    print(
        f"[reqtocode] orphan baseline written: {layout.orphan_baseline_path.as_posix()}"
        f" ({len(pruned)} entries)"
    )


def _update_test_orphan_baseline(repo_root: Path, layout: RepoLayout | None = None) -> None:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    current = compute_orphan_test_baseline(repo_root, None, layout)
    existing, _ = load_test_orphan_baseline(repo_root, layout)
    orphan_file = repo_root / layout.test_orphan_baseline_path
    # Shrink-only: keep only entries that are still orphan (paid/removed ones drop).
    pruned = current if not orphan_file.is_file() else existing & current
    orphan_file.parent.mkdir(parents=True, exist_ok=True)
    orphan_file.write_text(
        render_test_orphan_baseline(pruned, layout), encoding="utf-8", newline="\n"
    )
    print(
        f"[reqtocode] orphan-test baseline written: {layout.test_orphan_baseline_path.as_posix()}"
        f" ({len(pruned)} entries)"
    )


def run_check(
    repo_root: Path,
    fix: bool = False,
    update_baseline: bool = False,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> int:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    if fix:
        changed, errors = regenerate_if_stale(repo_root, layout)
        if errors:
            for error in errors:
                print(f"[reqtocode] PARSE ERROR: {error}", file=sys.stderr)
            return 1
        if changed:
            print(f"[reqtocode] regenerated {layout.generated_path.as_posix()}")
    if update_baseline:
        _update_baseline(repo_root, layout)

    result = verify(repo_root, None, layout, conventions)
    for warning in result.warnings:
        print(f"[reqtocode] WARNING: {warning}")
    for error in result.errors:
        print(f"[reqtocode] ERROR: {error}", file=sys.stderr)
    stats = result.stats
    if stats:
        print(
            f"[reqtocode] {stats['requirements']} requirements"
            f" ({stats['approved']} approved, {stats['traced']} traced,"
            f" {stats['covered']} test-covered;"
            f" baseline debt: {stats['baseline_suppressed_trace']} trace"
            f" / {stats['baseline_suppressed_test']} test"
            f" / {stats['baseline_suppressed_orphan']} orphan"
            f" / {stats['baseline_suppressed_orphan_test']} orphan-test)"
        )
    if result.errors:
        print(f"[reqtocode] FAIL: {len(result.errors)} violation(s)", file=sys.stderr)
        return 1
    print("[reqtocode] OK")
    return 0


def run_generate(repo_root: Path, layout: RepoLayout | None = None) -> int:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    changed, errors = regenerate_if_stale(repo_root, layout)
    if errors:
        for error in errors:
            print(f"[reqtocode] PARSE ERROR: {error}", file=sys.stderr)
        return 1
    parsed = parse_requirements(repo_root, layout)
    state = "regenerated" if changed else "already up to date"
    print(
        f"[reqtocode] {layout.generated_path.as_posix()} {state}"
        f" ({len(parsed.requirements)} requirements)"
    )
    return 0


def run_diff(
    repo_root: Path,
    base: str = "HEAD",
    strict: bool = False,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> int:
    result = compute_requirement_diff(repo_root, base, layout, conventions)
    for error in result.errors:
        print(f"[reqtocode] PARSE ERROR: {error}", file=sys.stderr)
    if result.errors:
        return 1
    for line in render_diff(result):
        print(line)
    if strict and result.drift_changes:
        print(
            f"[reqtocode] FAIL: {len(result.drift_changes)} requirement(s) changed without"
            " updating their implementing/covering code. Propagate the change or update the"
            " annotations, then commit the requirement and code together.",
            file=sys.stderr,
        )
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m rotaris_core.reqtocode",
        description="Requirements-to-code traceability (docs/reference/reqtocode-blueprint.md)",
    )
    parser.add_argument("--repo-root", type=Path, default=None, help=argparse.SUPPRESS)
    parser.add_argument(
        "--layout",
        type=Path,
        default=None,
        help=f"layout config file (default: {CONFIG_FILENAME} at the repository root)",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="verify traceability; exit 0 ok / 1 violations")
    check.add_argument("--fix", action="store_true", help="regenerate swr.py first if stale")
    check.add_argument(
        "--update-baseline",
        action="store_true",
        help="prune satisfied entries from the bootstrap baseline (shrink-only)",
    )
    sub.add_parser("generate", help="regenerate the traceables file if stale")
    diff = sub.add_parser(
        "diff", help="worklist of requirement changes vs a base ref (the propagation trigger)"
    )
    diff.add_argument("--base", default="HEAD", help="git ref to diff against (default HEAD)")
    diff.add_argument(
        "--strict",
        action="store_true",
        help="exit 1 when a requirement's text changed but no implementing/covering site did",
    )

    args = parser.parse_args(argv)
    repo_root = args.repo_root or find_repo_root()
    try:
        try:
            layout = load_layout(repo_root, args.layout)
        except LayoutError as exc:
            # A bad layout config is a user error (exit 1), not an internal fault.
            print(f"[reqtocode] CONFIG ERROR: {exc}", file=sys.stderr)
            return 1
        if args.command == "check":
            return run_check(
                repo_root, fix=args.fix, update_baseline=args.update_baseline, layout=layout
            )
        if args.command == "diff":
            return run_diff(repo_root, base=args.base, strict=args.strict, layout=layout)
        return run_generate(repo_root, layout)
    except Exception as exc:  # internal error contract: exit 2
        print(f"[reqtocode] INTERNAL ERROR: {exc!r}", file=sys.stderr)
        return 2


def _self_annotate() -> None:
    # Bootstrap-safe (blueprint §11): tolerate a missing/stale generated module.
    try:
        from rotaris_core.reqtocode.declarations import traces
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2324)(run_generate)
        traces(SWR.SWR_2326)(run_check)
        traces(SWR.SWR_2335)(find_repo_root)
        traces(SWR.SWR_2335)(main)
        traces(SWR.SWR_2327)(_update_baseline)
        traces(SWR.SWR_2332)(run_diff)
        traces(SWR.SWR_2333)(_update_orphan_baseline)
        traces(SWR.SWR_2334)(_update_test_orphan_baseline)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


_self_annotate()
