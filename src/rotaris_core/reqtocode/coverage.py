"""ReqToCode public coverage query — "what covers requirement X?" without enforcement.

The per-requirement coverage map already existed inside the verifier's reference
sweep; it was only reachable by running the whole verification. This module is the
public, side-effect-free view of it: which implementation sites and which covering
tests exist for one requirement, or for all of them.

It reads the requirement store and the source roots and nothing else — no git, no
network, no writes — and never raises for an uncovered or unknown requirement: it
answers with empty site tuples. Consumers are the evidence-gated completion check
and the Mission-Control coverage view.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from rotaris_core.reqtocode.conventions import DEFAULT_CONVENTIONS
from rotaris_core.reqtocode.generator import parse_requirements
from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT
from rotaris_core.reqtocode.verifier import Sweep, sweep_references

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from rotaris_core.reqtocode.conventions import ConventionRegistry
    from rotaris_core.reqtocode.generator import ParseResult
    from rotaris_core.reqtocode.layout import RepoLayout
    from rotaris_core.reqtocode.verifier import Occurrence


@dataclass(frozen=True)
class CoverageSite:
    """One annotated location claiming a requirement."""

    path: str  # repository-relative posix path
    line: int
    kind: str  # "traces" | "verifies" | "@req"


@dataclass(frozen=True)
class RequirementCoverage:
    """Every implementation and test site recorded for one requirement."""

    number: int
    implementations: tuple[CoverageSite, ...] = ()
    tests: tuple[CoverageSite, ...] = ()

    @property
    def is_traced(self) -> bool:
        return bool(self.implementations)

    @property
    def is_test_covered(self) -> bool:
        return bool(self.tests)


def _sites(occurrences: Sequence[Occurrence] | None) -> tuple[CoverageSite, ...]:
    if not occurrences:
        return ()
    return tuple(CoverageSite(path=occ.file, line=occ.line, kind=occ.kind) for occ in occurrences)


def coverage_from_sweep(sweep: Sweep, number: int) -> RequirementCoverage:
    """Pure: project an already-computed sweep onto one requirement number."""
    return RequirementCoverage(
        number=number,
        implementations=_sites(sweep.impl_traces.get(number)),
        tests=_sites(sweep.test_coverage.get(number)),
    )


def _sweep_for(
    repo_root: Path,
    layout: RepoLayout | None,
    conventions: ConventionRegistry | None,
    parsed: ParseResult | None,
) -> tuple[Sweep, ParseResult]:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    conventions = conventions if conventions is not None else DEFAULT_CONVENTIONS
    parsed = parsed if parsed is not None else parse_requirements(repo_root, layout)
    return sweep_references(repo_root, parsed.legacy_aliases, layout, conventions), parsed


def requirement_coverage(
    repo_root: Path,
    number: int,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
    parsed: ParseResult | None = None,
) -> RequirementCoverage:
    """Implementation and test sites for one requirement number.

    An unknown or uncovered requirement yields empty tuples rather than an error.
    Pass `parsed` to reuse an existing parse when querying repeatedly.
    """
    sweep, _ = _sweep_for(repo_root, layout, conventions, parsed)
    return coverage_from_sweep(sweep, number)


def coverage_map(
    repo_root: Path,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
    parsed: ParseResult | None = None,
) -> dict[int, RequirementCoverage]:
    """Coverage for every requirement in the store, keyed by requirement number.

    Requirement numbers that are referenced by code but no longer declared are
    included too, so a caller can see stale references without re-running the
    verifier. Requirements with no sites map to an entry with empty tuples.
    """
    sweep, parse_result = _sweep_for(repo_root, layout, conventions, parsed)
    numbers = {r.number for r in parse_result.requirements}
    numbers.update(sweep.all_references)
    return {number: coverage_from_sweep(sweep, number) for number in sorted(numbers)}


def _self_annotate() -> None:
    # Bootstrap-safe (blueprint §11): tolerate a missing/stale generated module.
    try:
        from rotaris_core.reqtocode.declarations import traces
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2336)(RequirementCoverage)
        traces(SWR.SWR_2336)(coverage_from_sweep)
        traces(SWR.SWR_2336)(requirement_coverage)
        traces(SWR.SWR_2336)(coverage_map)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


_self_annotate()
