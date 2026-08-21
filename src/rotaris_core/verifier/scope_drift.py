"""Scope drift: what this iteration changed that no requirement asked for (SWR-2607).

The mirror image of :mod:`rotaris_core.verifier.requirement_evidence`. That module
asks "did the requirements this change touched get verified?"; this one asks the
reverse — did the change touch production code that traces to nothing?

The judgement is **not** re-derived here. It is
:func:`rotaris_core.reqtocode.verifier.find_orphan_modules`, ReqToCode's existing
reverse-enforcement rule (SWR-2333), intersected with the iteration's changed set.
One rule, one implementation: a second definition of "untraced" that drifted from
ReqToCode's would make the two disagree about the same file.

The one deliberate difference is the baseline. ``docs/requirements/orphan-baseline.txt``
records pre-existing untraced modules so a repository adopting ReqToCode can keep a
green build while it pays the debt down. That is an excuse for *history*, not a
licence to keep editing untraced code unnoticed — so a baselined file this iteration
changed is still reported, flagged as baselined rather than hidden.

Reporting only. A drifting change is not blocked; it is made visible.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence
    from pathlib import Path

    from rotaris_core.reqtocode.conventions import ConventionRegistry
    from rotaris_core.reqtocode.generator import ParseResult
    from rotaris_core.reqtocode.layout import RepoLayout
    from rotaris_core.reqtocode.verifier import Sweep

_log = logging.getLogger(__name__)


@traces(SWR.SWR_2607)
class ScopeDriftEvidence(BaseModel):
    """Production files an iteration changed that trace to no requirement.

    An instance with an empty ``files`` list means "computed, and nothing
    drifted" — deliberately distinct from a ``None`` field on the report, which
    means the drift was not computed at all.
    """

    #: Repository-relative posix paths, sorted. Named, never merely counted:
    #: a reviewer cannot act on "3 files drifted".
    files: list[str] = Field(default_factory=list)
    #: ``len(files)``, stored so a large drift is visible at a glance without
    #: reading the list, and so it survives the report's JSON round-trip.
    total: int = 0
    #: The subset of ``files`` the orphan baseline already excuses. Still
    #: reported — the baseline forgives the past, not this iteration's edit.
    baselined_files: list[str] = Field(default_factory=list)

    @property
    def drifted(self) -> bool:
        """Whether anything drifted at all."""
        return bool(self.files)


@traces(SWR.SWR_2607)
def drift_from_orphans(
    changed_files: Iterable[str],
    orphan_modules: Iterable[str],
    baselined: Iterable[str] = (),
) -> ScopeDriftEvidence:
    """Pure projection: the changed files that ReqToCode considers orphan code.

    ``orphan_modules`` is :func:`find_orphan_modules`' verdict for the workspace,
    which already excludes test roots, structural shims and exempt-marked files —
    so nothing here re-implements those exclusions. ``baselined`` is only used to
    annotate the result; it never removes a file from it.
    """
    orphans = set(orphan_modules)
    excused = set(baselined)
    drifted = sorted({path for path in changed_files if path in orphans})
    return ScopeDriftEvidence(
        files=drifted,
        total=len(drifted),
        baselined_files=[path for path in drifted if path in excused],
    )


@traces(SWR.SWR_2607)
def build_scope_drift(
    repo_root: Path,
    changed_files: Sequence[str],
    *,
    sweep: Sweep | None = None,
    parsed: ParseResult | None = None,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> ScopeDriftEvidence:
    """Compute scope drift for one iteration's changed set.

    Pass an already-computed ``sweep`` (and its ``parsed`` result) to share the
    single repository sweep with the requirement-coverage pass; recomputing it
    would double the per-iteration cost for the same answer.
    """
    from rotaris_core.reqtocode.generator import parse_requirements
    from rotaris_core.reqtocode.verifier import (
        find_orphan_modules,
        load_orphan_baseline,
        sweep_references,
    )

    if not changed_files:
        return ScopeDriftEvidence()

    if sweep is None:
        parsed = parsed if parsed is not None else parse_requirements(repo_root, layout)
        sweep = sweep_references(repo_root, parsed.legacy_aliases, layout, conventions)

    orphans = find_orphan_modules(repo_root, sweep, layout, conventions)
    baselined, errors = load_orphan_baseline(repo_root, layout)
    if errors:
        # A malformed baseline line only costs the "already excused" annotation —
        # the file is reported as drift either way — but silently dropping it
        # would make the annotation quietly wrong.
        _log.warning("Orphan baseline has %d malformed entr(y/ies): %s", len(errors), errors[0])
    return drift_from_orphans(changed_files, orphans, baselined)
