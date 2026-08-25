#!/usr/bin/env python3
"""Milestone tooling for developing Rotaris — not part of the Rotaris product.

    uv run python devtools/milestone.py check
    uv run python devtools/milestone.py status [M<n>]
    uv run python devtools/milestone.py branch-for SWR-<n>
    uv run python devtools/milestone.py gate M<n> [--tests-passed]
    uv run python devtools/milestone.py notes M<n> [--base <ref>]
    uv run python devtools/milestone.py pr-body M<n> [--existing <file>]

Exit codes: 0 ok / 1 violations / 2 internal error — the same contract
``python -m rotaris_core.reqtocode`` uses, so an agent that knows one knows this.

Stdlib only apart from ``rotaris_core.reqtocode`` and ``rotaris_core.packaging``,
both of which are stdlib-only themselves. With ``PYTHONPATH=src`` this runs on a
bare checkout with no dependency install, the way the CI gates do.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from milestone_lib.gate import evaluate_gate  # noqa: E402
from milestone_lib.manifest import Milestone, parse_milestones  # noqa: E402
from milestone_lib.membership import (  # noqa: E402
    check_membership,
    load_requirements,
    milestone_for,
)
from milestone_lib.notes import grouped_changes  # noqa: E402
from milestone_lib.progress import progress_for  # noqa: E402
from milestone_lib.tracking import tracking_pr_body  # noqa: E402

PREFIX = "[milestone]"
OK, VIOLATIONS, INTERNAL_ERROR = 0, 1, 2

_REQ_ARG_RE = re.compile(r"^(?:SWR-)?(\d+)$", re.IGNORECASE)


def repo_root() -> Path:
    """The repository this file lives in — devtools/ sits at the root."""
    return Path(__file__).resolve().parent.parent


def _fail(message: str) -> int:
    print(f"{PREFIX} ERROR: {message}", file=sys.stderr)
    return VIOLATIONS


def _load(root: Path) -> tuple[tuple[Milestone, ...], dict[int, object], list[str]]:
    """Manifests, requirements and every problem with either."""
    parsed = parse_milestones(root)
    requirements, req_errors = load_requirements(root)
    errors = [*parsed.errors]
    if req_errors:
        errors += [f"requirement store: {error}" for error in req_errors]
    else:
        errors += check_membership(parsed.milestones, requirements)
    return parsed.milestones, requirements, errors


def _resolve(milestones: tuple[Milestone, ...], milestone_id: str) -> Milestone | None:
    wanted = milestone_id.upper()
    for milestone in milestones:
        if milestone.milestone_id.upper() == wanted:
            return milestone
    return None


def cmd_check(args: argparse.Namespace) -> int:
    root = repo_root()
    milestones, _, errors = _load(root)
    for error in errors:
        print(f"{PREFIX} ERROR: {error}", file=sys.stderr)
    if errors:
        print(f"{PREFIX} FAIL: {len(errors)} violation(s)")
        return VIOLATIONS
    open_count = sum(1 for m in milestones if m.is_open)
    print(f"{PREFIX} {len(milestones)} milestone(s) ({open_count} open)")
    print(f"{PREFIX} OK")
    return OK


def cmd_status(args: argparse.Namespace) -> int:
    root = repo_root()
    milestones, requirements, errors = _load(root)
    if errors:
        return _fail(f"{len(errors)} manifest violation(s) — run `check` for the list")

    wanted = [
        m
        for m in milestones
        if not args.milestone or m.milestone_id.upper() == args.milestone.upper()
    ]
    if args.milestone and not wanted:
        return _fail(f"no milestone {args.milestone}")

    for milestone in wanted:
        progress = progress_for(milestone, root, requirements)
        print(
            f"{milestone.milestone_id}  {milestone.title}"
            f"  [{milestone.status.value}]  -> v{milestone.target_version}  ({milestone.branch})"
        )
        print(
            f"    {progress.done}/{progress.total} approved ({progress.percent}%)"
            f"  {progress.traced} traced  {progress.covered} covered"
        )
        for group in progress.groups:
            print(f"    {group.heading}")
            for member in group.members:
                mark = "x" if member.is_done else " "
                print(f"      [{mark}] {member.req_id}  {member.status.value:10} {member.title}")
        print()
    return OK


def cmd_branch_for(args: argparse.Namespace) -> int:
    match = _REQ_ARG_RE.match(args.requirement.strip())
    if match is None:
        return _fail(f"{args.requirement!r} is not a SWR-<n> id")
    number = int(match.group(1))

    root = repo_root()
    milestones, requirements, errors = _load(root)
    if errors:
        return _fail(f"{len(errors)} manifest violation(s) — run `check` for the list")
    if number not in requirements:
        return _fail(f"SWR-{number} is not in the requirement store")

    owner = milestone_for(number, milestones, requirements)
    # No milestone is the normal answer: that is how a bug fix goes to master.
    print(owner.branch if owner else "master")
    return OK


def cmd_gate(args: argparse.Namespace) -> int:
    root = repo_root()
    milestones, requirements, errors = _load(root)
    if errors:
        return _fail(f"{len(errors)} manifest violation(s) — run `check` for the list")
    milestone = _resolve(milestones, args.milestone)
    if milestone is None:
        return _fail(f"no milestone {args.milestone}")

    progress = progress_for(milestone, root, requirements)
    result = evaluate_gate(
        milestone,
        root,
        progress,
        tests_passed=True if args.tests_passed else None,
        base_ref=args.base,
    )
    for check in result.checks:
        print(f"  [{'x' if check.ok else ' '}] {check.name}: {check.detail}")
    print(f"{PREFIX} {milestone.milestone_id}: {result.summary}")
    if not result.ok:
        print(f"{PREFIX} FAIL: {len(result.blockers)} blocker(s)")
        return VIOLATIONS
    print(f"{PREFIX} OK")
    return OK


def cmd_notes(args: argparse.Namespace) -> int:
    root = repo_root()
    milestones, requirements, errors = _load(root)
    if errors:
        return _fail(f"{len(errors)} manifest violation(s) — run `check` for the list")
    milestone = _resolve(milestones, args.milestone)
    if milestone is None:
        return _fail(f"no milestone {args.milestone}")
    progress = progress_for(milestone, root, requirements)
    print(grouped_changes(root, milestone, progress, base=args.base, head=args.head), end="")
    return OK


def cmd_pr_body(args: argparse.Namespace) -> int:
    root = repo_root()
    milestones, requirements, errors = _load(root)
    if errors:
        return _fail(f"{len(errors)} manifest violation(s) — run `check` for the list")
    milestone = _resolve(milestones, args.milestone)
    if milestone is None:
        return _fail(f"no milestone {args.milestone}")

    progress = progress_for(milestone, root, requirements)
    result = evaluate_gate(
        milestone,
        root,
        progress,
        tests_passed=True if args.tests_passed else None,
        base_ref=args.base,
    )
    existing = ""
    if args.existing:
        existing_path = Path(args.existing)
        if existing_path.is_file():
            existing = existing_path.read_text(encoding="utf-8")
    print(tracking_pr_body(progress, result, existing), end="")
    return OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="milestone",
        description="Milestone tooling for developing Rotaris (not a product feature).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="validate every milestone manifest").set_defaults(func=cmd_check)

    status = sub.add_parser("status", help="show milestone progress")
    status.add_argument("milestone", nargs="?", default="", help="M<n>; omit for all")
    status.set_defaults(func=cmd_status)

    branch = sub.add_parser("branch-for", help="print the branch a requirement's work belongs on")
    branch.add_argument("requirement", help="SWR-<n>")
    branch.set_defaults(func=cmd_branch_for)

    gate = sub.add_parser("gate", help="may this milestone merge into master?")
    gate.add_argument("milestone", help="M<n>")
    gate.add_argument(
        "--tests-passed",
        action="store_true",
        help="the full suite passed on this head (the caller ran it)",
    )
    gate.add_argument("--base", default="origin/master", help="base ref (default: origin/master)")
    gate.set_defaults(func=cmd_gate)

    notes = sub.add_parser("notes", help="release notes grouped by epic and requirement")
    notes.add_argument("milestone", help="M<n>")
    notes.add_argument("--base", default=None, help="range start (default: the previous tag)")
    notes.add_argument("--head", default="HEAD", help="range end (default: HEAD)")
    notes.set_defaults(func=cmd_notes)

    pr_body = sub.add_parser("pr-body", help="the tracking PR body")
    pr_body.add_argument("milestone", help="M<n>")
    pr_body.add_argument(
        "--existing", default="", help="current body, to preserve prose above the block"
    )
    pr_body.add_argument("--tests-passed", action="store_true", help="see `gate`")
    pr_body.add_argument(
        "--base", default="origin/master", help="base ref (default: origin/master)"
    )
    pr_body.set_defaults(func=cmd_pr_body)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result: int = args.func(args)
    except Exception as exc:  # noqa: BLE001 - the 2 in the 0/1/2 contract
        print(f"{PREFIX} INTERNAL ERROR: {exc}", file=sys.stderr)
        return INTERNAL_ERROR
    return result


if __name__ == "__main__":
    sys.exit(main())
