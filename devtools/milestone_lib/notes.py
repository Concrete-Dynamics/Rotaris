"""Release notes grouped by the milestone's epics and requirements.

Deliberately *not* in ``src/rotaris_core/packaging/release.py``. That module is
shipped product code traced to SWR-3002; teaching it to read our milestone
manifests would put our process inside the product. It keeps producing the flat
commit list for every tag, and this text is applied to the published Release
afterwards (``gh release edit --notes-file``).

The grouping works because the merge-message convention in AGENTS.md § 4 —
``<type>: <summary> (SWR-<n>)`` — puts the requirement id in the subject line.
A subject without one, or with an id outside the milestone, is never dropped:
it lands under "Other changes".
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from milestone_lib.git import run_git

if TYPE_CHECKING:
    from pathlib import Path

    from milestone_lib.git import GitRunner
    from milestone_lib.manifest import Milestone
    from milestone_lib.progress import MilestoneProgress

#: The trailing ``(SWR-1234)`` the merge convention guarantees.
_SUBJECT_ID_RE = re.compile(r"\(SWR-(\d+)\)\s*$")

#: Heading for subjects that match no member requirement.
OTHER_CHANGES = "Other changes"


def _previous_tag(repo_root: Path, head: str, runner: GitRunner | None) -> str:
    run = runner if runner is not None else run_git
    code, output = run(["describe", "--tags", "--abbrev=0", head], repo_root)
    return output.strip() if code == 0 else ""


def _subjects(repo_root: Path, rev_range: str, runner: GitRunner | None) -> list[str]:
    run = runner if runner is not None else run_git
    code, output = run(["log", "--no-merges", "--pretty=format:%s", rev_range], repo_root)
    if code != 0:
        return []
    return [line.strip() for line in output.splitlines() if line.strip()]


def grouped_changes(
    repo_root: Path,
    milestone: Milestone,
    progress: MilestoneProgress,
    *,
    base: str | None = None,
    head: str = "HEAD",
    runner: GitRunner | None = None,
) -> str:
    """Markdown for the Release body, grouped by epic then requirement."""
    if base is None:
        base = _previous_tag(repo_root, head, runner)
    rev_range = f"{base}..{head}" if base else head
    subjects = _subjects(repo_root, rev_range, runner)

    member_by_number = {member.number: member for member in progress.members}
    # Preserve the group order progress computed, so notes and the status table
    # read in the same sequence.
    order = [group.heading for group in progress.groups] + [OTHER_CHANGES]
    buckets: dict[str, dict[str, list[str]]] = {heading: {} for heading in order}
    heading_of = {
        member.number: group.heading for group in progress.groups for member in group.members
    }

    for subject in subjects:
        match = _SUBJECT_ID_RE.search(subject)
        number = int(match.group(1)) if match else None
        member = member_by_number.get(number) if number is not None else None
        if member is None:
            buckets[OTHER_CHANGES].setdefault("", []).append(subject)
            continue
        key = f"{member.req_id} — {member.title}"
        buckets[heading_of[member.number]].setdefault(key, []).append(subject)

    lines: list[str] = [f"## What's in {milestone.title}", ""]
    if base:
        lines += [f"Everything merged since `{base}`.", ""]
    wrote_any = False
    for heading in order:
        entries = buckets[heading]
        if not entries:
            continue
        wrote_any = True
        lines += [f"### {heading}", ""]
        for key in sorted(entries):
            if key:
                lines.append(f"- **{key}**")
                lines += [f"  - {subject}" for subject in entries[key]]
            else:
                lines += [f"- {subject}" for subject in entries[key]]
        lines.append("")
    if not wrote_any:
        lines += [f"No commits in `{rev_range}`.", ""]

    unmet = progress.outstanding
    if unmet:
        named = ", ".join(member.req_id for member in unmet)
        lines += [
            f"> **Not delivered in this milestone:** {named}."
            " These requirements are still open and were released without them.",
            "",
        ]
    return "\n".join(lines).rstrip() + "\n"
