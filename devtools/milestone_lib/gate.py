"""The merge-readiness gate: may this milestone branch land on ``master``?

Six checks, all of which must pass. Five are computed here; the sixth — the full
test suite — is *supplied* rather than run, because the suite takes six minutes
and swallowing that would make the gate unrunnable by hand. Without a verdict
the gate reports it unverified and fails, which is honest rather than quietly
optimistic.

ReqToCode and the version guard are called in-process through their own public
functions instead of shelled out, so the gate reports the same answer the CI
workflows do without a second interpreter or a ``PYTHONPATH`` dance.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from milestone_lib.git import run_git
from rotaris_core.packaging.release import declared_versions
from rotaris_core.reqtocode.diff import compute_requirement_diff
from rotaris_core.reqtocode.verifier import verify

if TYPE_CHECKING:
    from pathlib import Path

    from milestone_lib.git import GitRunner
    from milestone_lib.manifest import Milestone
    from milestone_lib.progress import MilestoneProgress

#: What the milestone branch must already contain before it may merge.
DEFAULT_BASE_REF = "origin/master"


@dataclass(frozen=True)
class Check:
    """One gate condition and how it came out."""

    name: str
    ok: bool
    detail: str


@dataclass(frozen=True)
class GateResult:
    """The verdict, and every check behind it."""

    milestone_id: str
    checks: tuple[Check, ...]

    @property
    def ok(self) -> bool:
        return all(check.ok for check in self.checks)

    @property
    def passed(self) -> int:
        return sum(1 for check in self.checks if check.ok)

    @property
    def blockers(self) -> tuple[str, ...]:
        return tuple(f"{c.name}: {c.detail}" for c in self.checks if not c.ok)

    @property
    def summary(self) -> str:
        """``5/6 — blocked on: …``, the line the tracking PR shows."""
        head = f"{self.passed}/{len(self.checks)}"
        if self.ok:
            return f"{head} — ready to merge"
        return f"{head} — blocked on: " + "; ".join(self.blockers)


def _members_check(progress: MilestoneProgress) -> Check:
    outstanding = progress.outstanding
    if not outstanding:
        return Check("members approved", True, f"all {progress.total} member(s) approved")
    named = ", ".join(f"{m.req_id} ({m.status.value})" for m in outstanding[:5])
    if len(outstanding) > 5:
        named += f", +{len(outstanding) - 5} more"
    return Check("members approved", False, f"{len(outstanding)} not approved — {named}")


def _reqtocode_check(repo_root: Path) -> Check:
    result = verify(repo_root)
    if result.ok:
        return Check("reqtocode clean", True, "no violations")
    first = "; ".join(result.errors[:3])
    more = f" (+{len(result.errors) - 3} more)" if len(result.errors) > 3 else ""
    return Check("reqtocode clean", False, f"{len(result.errors)} violation(s) — {first}{more}")


def _drift_check(repo_root: Path, base_ref: str) -> Check:
    result = compute_requirement_diff(repo_root, base_ref)
    if not result.base_available:
        return Check("no requirement drift", False, f"base ref {base_ref} is not available")
    if result.errors:
        return Check("no requirement drift", False, "; ".join(result.errors[:3]))
    drifted = result.drift_changes
    if not drifted:
        return Check("no requirement drift", True, f"no drift against {base_ref}")
    named = ", ".join(change.req_id for change in drifted[:5])
    return Check(
        "no requirement drift",
        False,
        f"{len(drifted)} requirement(s) changed with no site updated — {named}",
    )


def _versions_check(repo_root: Path, milestone: Milestone) -> Check:
    try:
        declared = declared_versions(repo_root)
    except (OSError, ValueError) as exc:
        # A missing or unreadable manifest is a blocker to report, not a crash:
        # the gate's job is to name what stands in the way of merging.
        return Check("versions match", False, f"cannot read the manifests — {exc}")
    wrong = {name: value for name, value in declared.items() if value != milestone.target_version}
    if not wrong:
        return Check("versions match", True, f"both manifests carry {milestone.target_version}")
    named = ", ".join(f"{name} is {value}" for name, value in sorted(wrong.items()))
    return Check(
        "versions match",
        False,
        f"target-version is {milestone.target_version} but {named}",
    )


def _base_merged_check(repo_root: Path, base_ref: str, runner: GitRunner | None) -> Check:
    run = runner if runner is not None else run_git
    code, output = run(["merge-base", "--is-ancestor", base_ref, "HEAD"], repo_root)
    if code == 0:
        return Check("base merged in", True, f"{base_ref} is an ancestor of HEAD")
    detail = output or f"{base_ref} is not merged into this branch — merge it and re-run"
    return Check("base merged in", False, detail)


def _tests_check(tests_passed: bool | None) -> Check:
    if tests_passed is True:
        return Check("full suite green", True, "verdict supplied by the caller")
    if tests_passed is False:
        return Check("full suite green", False, "the caller reported a failing suite")
    return Check(
        "full suite green",
        False,
        "not run on this head — pass --tests-passed once `uv run pytest -q` is green",
    )


def evaluate_gate(
    milestone: Milestone,
    repo_root: Path,
    progress: MilestoneProgress,
    *,
    tests_passed: bool | None = None,
    base_ref: str = DEFAULT_BASE_REF,
    runner: GitRunner | None = None,
) -> GateResult:
    """Run every check. Order is stable so the output reads the same each time."""
    return GateResult(
        milestone_id=milestone.milestone_id,
        checks=(
            _members_check(progress),
            _reqtocode_check(repo_root),
            _drift_check(repo_root, base_ref),
            _versions_check(repo_root, milestone),
            _base_merged_check(repo_root, base_ref, runner),
            _tests_check(tests_passed),
        ),
    )
